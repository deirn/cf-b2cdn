import {
  CACHE_ERRORS_SECONDS,
  PLAIN_TEXT_CONTENT_TYPE,
} from './constants';

/**
 * A face will be picked from this list at random. Add and remove faces to suit
 * your needs/preferences.
 *
 * @type {string[]}
 */
const ERROR_FACES = [
  '¯\\_(ツ)_/¯',
  '(⊙_⊙)？',
  'ಥ_ಥ',
  '＼（〇_ｏ）／',
  '¯\\(°_o)/¯',
  '╮（╯＿╰）╭',
  '╮(╯▽╰)╭',
  '(⊙_⊙;)',
  '(°ロ°) !',
  '┐(\'～`;)┌',
  '┐(￣ヘ￣;)┌',
  '( ಠ ʖ̯ ಠ)',
  'ლ(ಠ_ಠ ლ)',
  `ლ(¯ロ¯"ლ)`,
  '┐(￣ヮ￣)┌',
  '(눈_눈)',
  '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧',
  '(ಠ_ಠ)',
  '(￣﹃￣)',
  '(ʘ ͟ʖ ʘ)',
  '( ಥ ʖ̯ ಥ)',
  '( ͡° ʖ̯ ͡°)',
];


/**
 * A map of response codes to what they mean so we can display some descriptive
 * text instead of just a goofy random face when a problem occurs.
 */
const ERROR_CODES = {
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '402': 'Payment Required',
  '403': 'Forbidden',
  '404': 'Not Found',
  '405': 'Method Not Allowed',
  '406': 'Not Acceptable',
  '407': 'Proxy Authentication Required',
  '408': 'Request Timeout',
  '409': 'Conflict',
  '410': 'Gone',
  '411': 'Length Required',
  '412': 'Precondition Required',
  '413': 'Request Entry Too Large',
  '414': 'Request-URI Too Long',
  '415': 'Unsupported Media Type',
  '416': 'Requested Range Not Satisfiable',
  '417': 'Expectation Failed',
  '500': 'Internal Server Error',
  '501': 'Not Implemented',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Timeout',
  '505': 'HTTP Version Not Supported',
};

export function getFacesPage() {
  return new Response(`${ERROR_FACES.join(' \n')}`, {
    headers: {'Content-Type': PLAIN_TEXT_CONTENT_TYPE},
  });
}


/**
 * Rewrite error responses from Backblaze B2 to have fun little faces. This
 * obfuscates the fact that Backblaze B2 is being used and is generally a
 * more succinct error page for end users.
 *
 * @param {Request} request the request from the client to B2
 * @param {Response} response the response from B2 to copy and modify
 * @return {Promise<Response>} the new response with a face and description
 */
export async function rewriteErrorResponse(request, response) {
  console.log('rewriteErrorResponse...');
  console.log('Original error response:');
  console.log(response);

  // pick a random face from our ERROR_FACES array
  const randomIdx = Math.floor(Math.random() * ERROR_FACES.length);
  const randomFace = ERROR_FACES[randomIdx];
  const statusText = ERROR_CODES[response.status];
  const responseBody = `${statusText}\n${randomFace}`;

  return new Response(responseBody, {
    status: response.status,
    statusText: statusText,
    headers: {
      'Cache-Control': `public, immutable, max-age=${CACHE_ERRORS_SECONDS}`,
      'Content-Type': PLAIN_TEXT_CONTENT_TYPE,
    },
  });
}

export default rewriteErrorResponse;
