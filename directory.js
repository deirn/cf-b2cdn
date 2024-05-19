import {
  B2_LIST_FILE_NAMES_ENDPOINT,
  CACHE_DIR_SECONDS,
  HTML_CONTENT_TYPE,
  KV_CONFIG_KEY,
} from './constants';
import {rewriteErrorResponse} from './error_handling';


function urlToB2Path(url) {
  return decodeURIComponent(url.pathname.substring(1)); // chop off first / character
}


/**
 * Given a URL that ends in a slash (/), list files in the bucket that begin with
 * that prefix.
 *
 * @param {Request} request the user's request for a URL that ends in a slash
 * @param {object} b2 the b2config object
 * @return {Promise<Response|Response>} an HTML page listing files and folders
 */
async function getB2Directory(request, b2) {
  console.log('getB2Directory...');

  const requestedUrl = new URL(request.url);
  console.log(`requestedUrl.pathname = ${requestedUrl.pathname}`);
  if (requestedUrl.hostname !== DIR_DOMAIN) {
    return rewriteErrorResponse(request, new Response(null, {status: 404}));
  }

  const url = new URL(b2.data.apiUrl);
  url.pathname = B2_LIST_FILE_NAMES_ENDPOINT;

  const prefix = urlToB2Path(requestedUrl);
  console.log(`prefix = ${prefix}`);

  const requestBody = {
    bucketId: b2.data.bucketId,
    maxFileCount: 10000,
    prefix: prefix,
    delimiter: '/',
  };

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': b2.data.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    return rewriteErrorResponse(request, response);
  }
  const htmlResponse = await convertListFileNamesToHTML(request, response);
  const cacheControl = `public, immutable, max-age=${CACHE_DIR_SECONDS}`;
  const expires = new Date(Date.now() + CACHE_DIR_SECONDS * 1000).toUTCString();

  htmlResponse.headers.set('Cache-Control', cacheControl);
  htmlResponse.headers.set('Expires', expires);
  return htmlResponse;
}

/**
 * Converts the JSON returned from B2's b2_list_file_names endpoint into an HTML
 * list page of files and "folders".
 *
 * @param {Request} request the user's request
 * @param {Response} response the B2 response to our b2_list_file_names call
 * @return {Promise<Response|Response>} an HTML page listing the files/folders
 */
async function convertListFileNamesToHTML(request, response) {
  console.log('convertListFileNamesToHTML...');
  const respJson = await response.json();
  const requestUrl = new URL(request.url);
  const baseFileUrl = new URL(request.url);
  baseFileUrl.hostname = MAIN_DOMAIN;
  const fullPath = urlToB2Path(requestUrl);
  let currentDir = fullPath.match(/([^/]+)\/$/);
  if (currentDir) {
    currentDir = currentDir[1];
  } else {
    currentDir = '/';
  }
  const prefixLength = fullPath.length;

  let listings = '';
  if (prefixLength > 0) {
    listings = HTML_LINE_ITEM('..', '..', '', '', '');
  }

  const folders = [];
  const files = [];

  // make sure folders show up first
  for (const file of respJson.files) {
    if (/(?:^|\/)\.bzEmpty$/.test(file.fileName)) {
      // skip .bzEmpty files which are there to help create "folders"
    } else if (/(?:^|\/)\.[^\/]*\/?$/.test(file.fileName)) {
      // skip dot-files so they're "hidden"
    } else if (file.action === 'folder') {
      folders.push(file);
    } else {
      files.push(file);
    }
  }

  // check if we received zero results. If so, this folder didn't exist
  // so return a 404
  if (!(folders.length || files.length)) {
    const errorResponse = new Response('', {status: 404});
    return rewriteErrorResponse(request, errorResponse);
  }

  for (const fldr of folders) {
    listings += convertFileInfoJsonToHTML(requestUrl, fldr, prefixLength);
  }
  for (const file of files) {
    listings += convertFileInfoJsonToHTML(baseFileUrl, file, prefixLength);
  }

  const html = HTML_FILE_LIST(currentDir, '/' + fullPath, listings);
  return new Response(html, {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': HTML_CONTENT_TYPE,
    },
  });
}


/**
 * Given a file object's JSON returned from B2's b2_list_file_names endpoint,
 * returns a row for an HTML table as defined by the HTML_LINE_ITEM template.
 *
 * @param baseUrl a URL object or string that will make up the absolute link
 * @param file one file object from the list returned by b2_list_file_names
 * @param prefixLength the length of the path leading up to this file name
 * @return {string} the HTML_LINE_ITEM template defined below filled out for this file in particular
 */
function convertFileInfoJsonToHTML(baseUrl, file, prefixLength) {
  const basename = file.fileName.substring(prefixLength);
  if (!basename) {
    return '';
  }

  let dateStr = '', sizeStr = '', sizeActual = '';
  if (file.action !== 'folder') {
    const ts = new Date(file.uploadTimestamp);
    dateStr = ts.toISOString().replace('T', ' ').split('.')[0];
    let size = file.contentLength;
    sizeStr = getHumanReadableFileSize(size);
    sizeActual = size.toLocaleString() + (size === 1 ? ' byte' : ' bytes');
  }

  return HTML_LINE_ITEM(basename, basename, sizeStr, sizeActual, dateStr, file.action);
}


/**
 * Given a number of Bytes, return a more human-readable SI Unit rounded to
 * the nearest 1/10 (Mebibyte or less) or 1/100 (Gibibyte and up). Less than
 * 4 KiB will return the same number with a "B" appended to the end.
 *
 * The return is a string of the number with the unit it was converted to.
 * i.e. 4404019 will return "4.2 MiB", 5001708 will return "4.77 GiB", etc.
 *
 * @param numBytes the number to be converted
 * @return {string} the rounded number with the SI unit appended to the end
 */
function getHumanReadableFileSize(numBytes) {
  if (numBytes > 1099511627776) { // 1 TiB
    numBytes = (numBytes / 1099511627776).toFixed(2);
    numBytes = `${numBytes} TiB`;
  } else if (numBytes > 1073741824) { // 1 GiB
    numBytes = (numBytes / 1073741824).toFixed(2);
    numBytes = `${numBytes} GiB`;
  } else if (numBytes > 1048576) { // 1 MiB
    numBytes = (numBytes / 1048576).toFixed(1);
    numBytes = `${numBytes} MiB`;
  } else if (numBytes > 4096) { // 4 KiB
    numBytes = (numBytes / 1024).toFixed(1);
    numBytes = `${numBytes} KiB`;
  } else {
    numBytes = `${numBytes} B`;
  }

  return numBytes;
}

function escapeHtml(unsafe) {
  return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

function fullPathAnchors(fullPath) {
  let res = `<a class="mx-1" href="/">${SITE_NAME}</a>`;

  let parent = '/';
  const split = fullPath.split('/');
  for (let i = 1; i < (split.length - 1); i++) {
    const path = split[i];
    parent += `${path}/`;
    res += `/<a class="mx-1" href="${parent}">${path}</a>`;
  }

  return res + '/';
}

/**
 * Full HTML Template for the listing pages.
 *
 * @param currentDir the name of the folder we're currently on
 * @param fullPath the full path to the folder we're currently on
 * @param listings an array of HTML_LINE_ITEM items
 * @return {string} an HTML template for the listing pages
 */
const HTML_FILE_LIST = (currentDir, fullPath, listings) => `<!DOCTYPE HTML>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title>${currentDir === '/' ? 'Root Directory' : currentDir} - ${SITE_NAME}</title>

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.1/dist/css/bootstrap.min.css" integrity="sha256-DF7Zhf293AJxJNTmh5zhoYYIMs2oXitRfBjY+9L//AY=" crossorigin="anonymous">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/css/all.min.css" integrity="sha256-mUZM63G8m73Mcidfrv5E+Y61y7a12O5mW4ezU3bxqW4=" crossorigin="anonymous">
  </head>
  <body class="bg-light">
    <div class="container-fluid container-md">
      <div class="lead py-2">${fullPathAnchors(fullPath)}</div>
    </div>

    <div class="container-fluid container-md table-responsive">
      <table class="table table-hover border bg-white text-nowrap">
        <tbody>
          ${listings}
        </tbody>
      </table>
    </div>
  </body>
</html>
`;

/**
 * HTML table row template for file/folders listings.
 *
 * Represents one row, and therefore one file/folder on the table of
 * files/folders in our current directory.
 *
 * @param link what the item will link to when clicked (changes href attribute)
 * @param basename the file name to display
 * @param size the value of the Content-Length header sent by the
 * @param uploaded the timestamp of when the file was uploaded to Backblaze
 * @param action In B2 the action field is 'folder' for folders.
 * @return {string} the HTML template with variables filled in
 * @constructor
 */
const HTML_LINE_ITEM = (link, basename, sizeStr, sizeTitle, uploaded, action) => {
  let icon;
  if (link === '..') {
    icon = 'level-up-alt';
  } else if (action === 'folder') {
    icon = 'folder-open';
  } else if (/\.(jpe?g|png|bmp|tiff?|gif|webp|tga|cr2|nef|ico)$/i.test(basename)) {
    icon = 'file-image';
  } else if (/\.(pub|txt|ini|cfg)$/i.test(basename)) {
    icon = 'file-alt';
  } else if (/\.(mp4|mkv|wmv|flv|hls|ogv|avi)$/i.test(basename)) {
    icon = 'file-video';
  } else if (/\.(mp3|wav|wma|flac|ogg|aac|m4a)$/i.test(basename)) {
    icon = 'file-audio';
  } else if (/\.(zip|tgz|gz|tar|7z|rar|xz|jar)$/i.test(basename)) {
    icon = 'file-archive';
  } else if (/\.(docx?)$/i.test(basename)) {
    icon = 'file-word';
  } else if (/\.(xlsx?)$/i.test(basename)) {
    icon = 'file-excel';
  } else if (/\.(pp[st]x?)$/i.test(basename)) {
    icon = 'file-powerpoint';
  } else if (/\.(pdf)$/i.test(basename)) {
    icon = 'file-pdf';
  } else if (/\.([ch](?:pp)?|cs|css|js|json|java|vb[as]?|py)$/i.test(basename)) {
    icon = 'file-code';
  } else if (/\.(csv)$/i.test(basename)) {
    icon = 'file-csv';
  } else if (/\.(sig|asc)$/i.test(basename)) {
    icon = 'file-signature';
  } else {
    icon = 'file';
  }

  return TEMPLATE_HTML_LINE_ITEM(link, basename, sizeStr, sizeTitle, uploaded, icon);
};

const TEMPLATE_HTML_LINE_ITEM = (link, basename, sizeStr, sizeTitle, uploaded, icon) => `
<tr>
    <td scope="row">
        <a href="${link}"><i class="fas fa-fw fa-lg fa-${icon}" aria-hidden="true"></i> ${escapeHtml(basename)}</a>
    </td>
    <td class="text-right"><span title="${sizeTitle}">${sizeStr}</span></td>
    <td class="text-right">${uploaded}</td>
</tr>
`;

export default getB2Directory;
