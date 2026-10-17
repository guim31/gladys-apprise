// -----------------------------------------------------------------------------
// The one function that talks to the network: an HTTP(S) request with a JSON
// body, on node:http / node:https. Not on fetch: fetch cannot accept the
// self-signed certificate of one server only (an Apprise behind a home reverse
// proxy often has one), node:https can, per request. Redirects are not
// followed: the client reports them (an http:// address answered by https).
// A timeout once the whole request was written is flagged `accepted`: Apprise
// goes on sending what it received.
//
// The client takes this function as a parameter: the tests replace it with an
// in-memory Apprise (test/helpers/fakeApprise.js). (Adapted from guim31/gladys-gotify.)
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * @param {string} url absolute URL
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {Record<string, string>} [options.headers]
 * @param {unknown} [options.json] body, sent as JSON
 * @param {boolean} [options.insecure] accept a certificate that does not verify (HTTPS only)
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }>}
 */
export function httpRequest(
  url,
  { method = 'GET', headers = {}, json, insecure = false, timeoutMs = 10_000 } = {},
) {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const payload = json === undefined ? undefined : Buffer.from(JSON.stringify(json));
  const requestHeaders = {
    accept: 'application/json',
    ...headers,
    ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
  };

  return new Promise((resolve, reject) => {
    const request = (isHttps ? https : http).request(
      target,
      {
        method,
        headers: requestHeaders,
        timeout: timeoutMs,
        ...(isHttps ? { rejectUnauthorized: !insecure } : {}),
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            request.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        response.on('error', reject);
      },
    );
    // `timeout` only bounds the idle time between two packets: a server
    // trickling its answer would keep the request alive. This one bounds it all.
    let written = false;
    const timedOut = () => {
      const error = new Error(`Timed out after ${timeoutMs} ms`);
      error.code = 'ETIMEDOUT';
      error.accepted = written;
      request.destroy(error);
    };
    const deadline = setTimeout(timedOut, timeoutMs);
    deadline.unref?.();
    request.on('finish', () => {
      written = true;
    });
    request.on('close', () => clearTimeout(deadline));
    request.on('timeout', timedOut);
    request.on('error', reject);
    request.end(payload);
  });
}
