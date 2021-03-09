// MIME Types for Content-Type HTTP header
export const PLAIN_TEXT_CONTENT_TYPE = 'text/plain;charset=utf-8';
export const HTML_CONTENT_TYPE = 'text/html;charset=utf-8';


// B2 API URLs / Endpoints

/**
 * The URL to retrieve most of the information we need to interact with the
 * rest of Backblaze B2's API including an authorization token.
 * https://www.backblaze.com/b2/docs/b2_authorize_account.html
 *
 * @type {string}
 */
export const B2_AUTHORIZE_URL = 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account';

/**
 * Obtain a download authorization token. This is a special kind of token for
 * downloading a subset of files from an account. The validity period of the
 * token can be much longer than an authorization token's (you can request up
 * to 1 week).
 * https://www.backblaze.com/b2/docs/b2_get_download_authorization.html
 *
 * @type {string}
 */
export const B2_GET_DOWNLOAD_AUTHORIZATION_ENDPOINT = '/b2api/v2/b2_get_download_authorization';

/**
 * List details of each bucket in the account. We use this to resolve a bucket
 * name to a bucket ID.
 * https://www.backblaze.com/b2/docs/b2_list_buckets.html
 *
 * @type {string}
 */
export const B2_LIST_BUCKETS_ENDPOINT = '/b2api/v2/b2_list_buckets';

/**
 * List file names in a given bucket, optionally with a prefix.
 * https://www.backblaze.com/b2/docs/b2_list_file_names.html
 *
 * @type {string}
 */
export const B2_LIST_FILE_NAMES_ENDPOINT = '/b2api/v2/b2_list_file_names';


// Workers KV Keys

/**
 * The Workers KV key that we stored our B2 Authorization response in.
 *
 * @type {string}
 */
export const KV_CONFIG_KEY = 'b2auth';


// Cache-Control header constants

/**
 * Default cache age of most responses
 *
 * @type {number}
 */
export const CACHE_AGE_SECONDS = 604800; // 1 week in seconds

/**
 * How long to cache a directory listing page
 * @type {number}
 */
export const CACHE_DIR_SECONDS = 30;

/**
 * How long error pages should be cached for
 *
 * @type {number}
 */
export const CACHE_ERRORS_SECONDS = 10;


/**
 * This is the amount of time to cache the authorizationToken from Workers KV
 * in this worker's global scope.
 * See this thread on Cloudflare's forums:
 * https://community.cloudflare.com/t/workers-global-variables/121123/11
 * tl;dr, a Worker will persist values in its global scope between requests.
 * When the last refresh from KV has been greater than this value, go ahead
 * and serve the value but schedule a refresh from KV using the event.waitUntil
 * handler so as to not slow down this current request.
 *
 * @type {number}
 */
export const SECONDS_TO_CACHE_KV_AUTH_STALE = 300;

/**
 * Unlike the above, if a request comes in and the auth token hasn't been
 * refreshed in this much time, we should not attempt to use the token and
 * instead await getting the latest token from KV.
 * By default the token stored in KV is refreshed every 4 hours by the cron job.
 * Auth tokens don't last longer than 24 hours according to the B2 docs.
 * Therefore, the worst case scenario is a token that was just shy of 4 hours
 * old and still has about 20 hours of validity left.
 *
 * @type {number}
 */
export const SECONDS_TO_CACHE_KV_AUTH_INVALID = 43200; // 12 hours in seconds
