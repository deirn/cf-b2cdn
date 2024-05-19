/**
 * Responsible for handling the actual downloading of a requested file from B2.
 */

import {rewriteErrorResponse} from './error_handling';
import {
  CACHE_AGE_SECONDS,
  PLAIN_TEXT_CONTENT_TYPE,
} from './constants';


/**
 * Fetch and return a file from Backblaze B2 by supplying the download authorization
 * token in the Authorization header.
 * Errors are rewritten to not give away that this is a B2 bucket.
 * Headers starting with "x-bz" are removed before being returned to the user.
 * Adds cache and security-related headers.
 *
 * @param request the request from a client that will be rewritten to fetch from
 *                a Backblaze B2 bucket
 * @param {object} b2 the b2config object
 * @return {Promise<Response>} the Response to the client that will either be
 *                              the requested file or an error page
 */
async function getB2File(request, b2) {
  const requestedUrl = new URL(request.url);
  console.log(`requestedUrl = ${requestedUrl.toString()}`);
  if (DIR_DOMAIN !== MAIN_DOMAIN && requestedUrl.hostname === DIR_DOMAIN) {
    requestedUrl.hostname = MAIN_DOMAIN;
    return Response.redirect(requestedUrl.toString(), 301);
  }
  const url = new URL(b2.data.downloadUrl);
  url.pathname = `/file/${B2BUCKET}${requestedUrl.pathname}`;

  const response = await fetch(url.toString(), {
    cf: {
      cacheTtl: 60,
      cacheEverything: true,
    },
    headers: {
      'Authorization': b2.data.authorizationToken,
    },
  });

  if (response.ok) {
    return modifiedB2Response(request, response);
  } else {
    return rewriteErrorResponse(request, response);
  }
}


/**
 * Adds cache headers, converts some Backblaze B2-specific headers to standard
 * headers, and deletes the headers that start with "x-bz"
 *
 * @param request a request for a file on B2
 * @param response the successful response from B2 that will be copied and modified
 * @param convertHeaders if true, convert x-bz headers to standard headers then delete them
 * @return {Promise<Response>} the modified response
 */
async function modifiedB2Response(request, response, convertHeaders=true) {
  console.log('modifiedB2Response...');
  const newResponse = new Response(response.body, response);

  // cache for a week
  newResponse.headers.set('Cache-Control', `public, immutable, max-age=${CACHE_AGE_SECONDS}`);
  newResponse.headers.set('Expires', new Date(Date.now() + CACHE_AGE_SECONDS * 1000).toUTCString());
  if (convertHeaders) {
    convertB2Headers(request, newResponse);
  }

  return newResponse;
}


/**
 * Converts the x-bz-content-sha1 header to an ETag header.
 * Converts the x-bz-upload-timestamp header to a Last-Modified header.
 * By default also deletes all headers that start with "x-bz"
 *
 * @param request the request from the client for a B2 file
 * @param response the response from B2 that will be modified in-place
 * @param deleteHeaders if true, delete the x-bz headers in the response
 */
function convertB2Headers(request, response, deleteHeaders=true) {
  console.log('convertB2Headers...');
  // get a Last-Modified header from x-bz-upload-timestamp
  let bzts = response.headers.get('x-bz-upload-timestamp');
  bzts = parseInt(bzts);
  const d = new Date(bzts);
  const lastModified = d.toUTCString();
  response.headers.set('Last-Modified', lastModified);

  // get an ETag header from x-bz-content-sha1
  let bzsha = response.headers.get('x-bz-content-sha1');
  bzsha = bzsha.replace(/^unverified:/, ''); // in case it was uploaded without a checksum
  bzsha = bzsha.substring(0, 16); // just get the first 16 characters of it
  bzsha = `"${bzsha}"`; // CloudFlare wants the ETag wrapped in quotes
  response.headers.set('ETag', bzsha);

  if (deleteHeaders) {
    // remove the 'x-bz-' Backblaze headers
    for (const header of response.headers.keys()) {
      if (header.match(/^x-bz/i)) {
        response.headers.delete(header);
      }
    }
  }

  // these file extensions we want to show up as plain text
  const url = new URL(request.url);
  if (/\.(pub|boot|cfg)$/.test(url.pathname)) {
    response.headers.set('Content-Type', PLAIN_TEXT_CONTENT_TYPE);
  }
}


export default getB2File;
