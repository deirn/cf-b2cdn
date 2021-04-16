import Router from './router';
import handleAuthCronJob from './authorization';
import {getFacesPage, rewriteErrorResponse} from './error_handling';
import getB2Directory from './directory';
import getB2File from './file_download';
import {
  KV_CONFIG_KEY,
  SECONDS_TO_CACHE_KV_AUTH_INVALID,
  SECONDS_TO_CACHE_KV_AUTH_STALE,
} from './constants';

const CACHE = caches.default;

/**
 * Our B2 object will get pulled from KV in the first request and will persist here until
 * the Worker is killed (otherwise having it out here in global scope saves us some KV calls)
 *
 * @type {object}
 */
const B2 = {
  date: undefined, // the JSON we persisted in KV with our auth token and more
  lastRefresh: undefined, // timestamp of when we last fetched our auth token from KV
};


/**
 * Add extra security headers to get an A on https://securityheaders.com/
 *
 * @param response a Response object that will be modified in-place
 */
function addSecurityHeaders(response) {
  const contentType = response.headers.get('Content-Type');

  // if HTML content
  if (/text\/html/i.test(contentType)) {
    // "unsafe-inline" for style-src doesn't seem like that big a deal
    // but it will prevent you from getting an A+ on https://securityheaders.com/
    //response.headers.set('Content-Security-Policy', `default-src 'self' cdn.jsdelivr.net; frame-ancestors 'self'`);
    // forbid geolocation and microphone usage by this page or any iframes on it
    response.headers.set('Permissions-Policy', `geolocation=(),microphone=()`);
    response.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  } else {
    // allow hotlinking of font files and other assets
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
}


/**
 * Attempts to pull our b2config object out of KV storage.
 *
 * @return {Promise<void>}
 */
async function refreshB2Config() {
  console.log('Getting our B2 authorization token from KV...');
  B2.data = JSON.parse(await B2CDN.get(KV_CONFIG_KEY));
  B2.lastRefresh = Date.now();
}


async function redirect(event) {
  const url = new URL(event.request.url);
  url.hostname = MAIN_DOMAIN;
  return Response.redirect(url.toString(), 301);
}


/**
 * Handle an incoming user request.
 *
 * @param event the fetch event that triggered this listener
 * @return {Promise<*>} a response either from Backblaze B2 or an error message
 */
async function handleRequest(event) {
  const request = event.request;

  // return from cache if we've seen this before and the response isn't stale
  const cachedResponse = await CACHE.match(request.clone());
  if (cachedResponse !== undefined) {
    console.log(`Served cached response for ${event.request.url}`);
    return cachedResponse;
  }

  const secondsSinceRefresh = (Date.now() - B2.lastRefresh) / 1000;

  if (B2.data === undefined || isNaN(secondsSinceRefresh) || secondsSinceRefresh > SECONDS_TO_CACHE_KV_AUTH_INVALID) {
    // the config is either very old or hasn't even been loaded from KV yet
    await refreshB2Config();
  } else if (secondsSinceRefresh > SECONDS_TO_CACHE_KV_AUTH_STALE) {
    // we'll be using the current token but this schedules the latest one to be read from KV
    console.log('Auth token is a little old, use it, but also refresh it in the background from KV');
    event.waitUntil(refreshB2Config());
  }

  const r = new Router();
  // Replace with the appropriate paths and handlers
  // r.get('.*/bar', () => new Response('responding for /bar'))
  // r.get('.*/foo', request => handler(request))

  // display the possible error message faces when a user visits /faces or /faces.txt
  r.get('/faces(\\.txt)?', getFacesPage);
  r.get('/robots\\.txt', (request) => new Response('User-Agent: *\nDisallow: /\n', {status: 200, headers: {'Content-Type': 'text/plain'}}));
  if (false) {
    r.get('/_refreshB2AuthToken', (request) => {
      handleAuthCronJob(null);
      return new Response('', {status: 204});
    });
  }
  r.get('.*/', (request) => getB2Directory(request, B2));
  // catch-all route to return a Backblaze B2 file (should be last router rule)
  r.get('.*', (request) => getB2File(request, B2));

  // evaluate this request and get the response from the matching route handler
  const response = await r.route(request);
  if (response.status < 300 || response.status >= 400) {
    addSecurityHeaders(response);
  }

  // put this response in the cache in the background (the Worker will stay alive to finish the job)
  event.waitUntil(CACHE.put(request.clone(), response.clone()));

  return response;
}


// entrypoint for HTTP Request
addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const domain = requestUrl.hostname;
  if (domain === MAIN_DOMAIN || domain === DIR_DOMAIN) {
    event.respondWith(handleRequest(event));
  } else {
    // redirect any non-main domain to the main domain (i.e. www.example.com to example.com)
    event.respondWith(redirect(event));
  }
});


// entrypoint for Cron Trigger
addEventListener('scheduled', (event) => {
  event.waitUntil(handleAuthCronJob(event));
});
