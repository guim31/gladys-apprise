// -----------------------------------------------------------------------------
// Apprise API client (caronc/apprise-api): the endpoints the integration needs.
//
//   GET  /status             {"attach_lock": false, "stateful_enabled": true, …}
//   POST /notify/            stateless: { urls, body, title?, type?, format?, attachment? }
//   POST /notify/{key}       stored configuration: { body, tag?, … }
//   GET  /json/urls/{key}    the services of a stored configuration and their tags
//                            (the test action only: the answer holds the URLs, with
//                            their secrets, and is never kept nor logged)
//
// Answers verified on apprise-api 2.0.1 (test/fixtures/apprise/): 200 sent,
// 424 "One or more notifications could not be sent" (a service failed, or no
// service matches the tags: then `details` is empty), 404 no such
// configuration, 400 no valid URL / empty body / bad attachment.
//
// Every failure becomes an AppriseError with a `kind` (ERROR_KINDS) the rest
// of the code translates for the user. Messages never carry a URL of a
// service, a password or a header value; the server address is logged without
// its credentials.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = {
  NO_SERVER: 'no_server',
  INVALID_URL: 'invalid_url',
  INVALID_KEY: 'invalid_key',
  NO_TARGET: 'no_target',
  UNREACHABLE: 'unreachable',
  TLS: 'tls',
  REDIRECT: 'redirect',
  NOT_APPRISE: 'not_apprise',
  UNAUTHORIZED: 'unauthorized',
  NO_CONFIG: 'no_config',
  NO_MATCH: 'no_match',
  INVALID_URLS: 'invalid_urls',
  BAD_ATTACHMENT: 'bad_attachment',
  SERVICE_FAILED: 'service_failed',
  REJECTED: 'rejected',
  SERVER_ERROR: 'server_error',
};

// The kinds that say "Apprise cannot be reached", as opposed to "it answered
// no": they drive the online/offline state of the monitor.
export const UNREACHABLE_KINDS = new Set([
  ERROR_KINDS.UNREACHABLE,
  ERROR_KINDS.TLS,
  ERROR_KINDS.REDIRECT,
  ERROR_KINDS.NOT_APPRISE,
  ERROR_KINDS.SERVER_ERROR,
]);

// The types of apprise-api, in its order.
export const NOTIFICATION_TYPES = ['info', 'success', 'warning', 'failure'];

// The key of a stored configuration, as apprise-api accepts it in its routes.
const KEY_PATTERN = /^[\w-]{1,128}$/;

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'EPROTO',
]);

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export class AppriseError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never a secret)
   * @param {{ status?: number, cause?: unknown }} [details]
   */
  constructor(kind, message, { status, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppriseError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * The server address typed by the user, as a base URL: `http://` added when no
 * scheme is given, a path prefix kept (an Apprise served under /apprise behind
 * a reverse proxy), credentials, trailing slash, query and fragment dropped
 * (credentials go in the dedicated fields).
 * @param {string} raw
 * @returns {URL}
 */
export function parseServerUrl(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '') {
    throw new AppriseError(ERROR_KINDS.NO_SERVER, 'No Apprise API address configured');
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    throw new AppriseError(ERROR_KINDS.INVALID_URL, 'The Apprise API address is not a URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    throw new AppriseError(ERROR_KINDS.INVALID_URL, 'The Apprise API address must be http(s)');
  }
  url.username = '';
  url.password = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

/** The address without credentials, for the logs. */
export function describeUrl(url) {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/**
 * A configuration key, checked against what apprise-api accepts.
 * @param {string} key
 * @returns {string}
 */
export function checkKey(key) {
  if (!KEY_PATTERN.test(key)) {
    throw new AppriseError(
      ERROR_KINDS.INVALID_KEY,
      'The configuration key holds letters, digits, "-" and "_" only',
    );
  }
  return key;
}

/**
 * The headers of the optional reverse proxy in front of Apprise: basic
 * authentication, and/or one custom header typed as "Name: value".
 * @param {{ auth_user?: string, auth_password?: string, auth_header?: string }} config
 * @returns {Record<string, string>}
 */
export function authHeaders({ auth_user: user = '', auth_password: password = '', auth_header }) {
  const headers = {};
  if (user !== '' || password !== '') {
    headers.authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }
  const match = /^\s*([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*:\s*(.*?)\s*$/.exec(auth_header ?? '');
  if (match && match[2] !== '') {
    headers[match[1].toLowerCase()] = match[2];
  }
  return headers;
}

/** Shortens an error text coming from the server before it reaches a log or a toast. */
const shorten = (text, max = 200) =>
  typeof text === 'string' && text.length > max ? `${text.slice(0, max - 1)}…` : text;

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** One service of a stored configuration, with the secrets of its URL left out. */
const describeService = (entry) => ({
  service: typeof entry?.service_name === 'string' ? entry.service_name.slice(0, 40) : '?',
  tags: Array.isArray(entry?.tags) ? entry.tags.filter((tag) => typeof tag === 'string') : [],
  enabled: entry?.enabled !== false,
});

export class AppriseClient {
  /**
   * @param {object} options
   * @param {string} options.serverUrl the address typed by the user
   * @param {Record<string, string>} [options.headers] reverse proxy authentication
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] replaced by the tests
   * @param {number} [options.timeoutMs]
   */
  constructor({
    serverUrl,
    headers = {},
    insecure = false,
    request = httpRequest,
    timeoutMs = 10_000,
  }) {
    this.base = parseServerUrl(serverUrl);
    this.headers = headers;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  get description() {
    return describeUrl(this.base);
  }

  url(path) {
    const url = new URL(this.base.href);
    // A URL always keeps a pathname of at least "/": never send "//notify/".
    url.pathname = `${this.base.pathname.replace(/\/+$/, '')}${path}`;
    return url.href;
  }

  async call(method, path, { json, timeoutMs = this.timeoutMs } = {}) {
    let response;
    try {
      response = await this.request(this.url(path), {
        method,
        headers: this.headers,
        json,
        insecure: this.insecure,
        timeoutMs,
      });
    } catch (err) {
      const code = err?.code;
      if (TLS_CODES.has(code) || /certificate/i.test(err?.message ?? '')) {
        throw new AppriseError(ERROR_KINDS.TLS, `TLS certificate refused (${code ?? 'TLS'})`, {
          cause: err,
        });
      }
      const reason = NETWORK_CODES.has(code) ? code : (code ?? 'network error');
      const error = new AppriseError(
        ERROR_KINDS.UNREACHABLE,
        `Apprise does not answer (${reason})`,
        {
          cause: err,
        },
      );
      // The whole request was written, the answer is late: Apprise is still
      // sending (it does not stop when the client leaves).
      error.accepted = err?.accepted === true;
      throw error;
    }
    const { status } = response;
    const data = parseJson(response.body);
    if (status >= 300 && status < 400) {
      throw new AppriseError(ERROR_KINDS.REDIRECT, `The address redirects (HTTP ${status})`, {
        status,
      });
    }
    if (status === 204) {
      return null;
    }
    if (status >= 200 && status < 300) {
      if (data === undefined || data === null || typeof data !== 'object') {
        throw new AppriseError(ERROR_KINDS.NOT_APPRISE, `Not an Apprise answer (HTTP ${status})`, {
          status,
        });
      }
      return data;
    }
    const description = shorten(typeof data?.error === 'string' ? data.error : `HTTP ${status}`);
    if (status === 401 || status === 403) {
      throw new AppriseError(ERROR_KINDS.UNAUTHORIZED, `Access refused: ${description}`, {
        status,
      });
    }
    if (status === 404) {
      if (data && /no configuration/i.test(description)) {
        throw new AppriseError(ERROR_KINDS.NO_CONFIG, 'No stored configuration under this key', {
          status,
        });
      }
      throw new AppriseError(ERROR_KINDS.NOT_APPRISE, 'Not an Apprise API (HTTP 404)', { status });
    }
    if (status === 424) {
      // Apprise reached no service at all: no service matches the tags (or
      // the configuration has none). Otherwise one service at least failed.
      if (Array.isArray(data?.details) && data.details.length === 0) {
        throw new AppriseError(ERROR_KINDS.NO_MATCH, 'No service matches the tags', { status });
      }
      throw new AppriseError(ERROR_KINDS.SERVICE_FAILED, `Apprise: ${description}`, { status });
    }
    if (status === 400 && /attachment/i.test(description)) {
      throw new AppriseError(ERROR_KINDS.BAD_ATTACHMENT, `Apprise: ${description}`, { status });
    }
    if (status === 400 && /no valid url/i.test(description)) {
      throw new AppriseError(ERROR_KINDS.INVALID_URLS, `Apprise: ${description}`, { status });
    }
    if (status >= 500 || status === 417) {
      throw new AppriseError(ERROR_KINDS.SERVER_ERROR, `Apprise error: ${description}`, {
        status,
      });
    }
    throw new AppriseError(ERROR_KINDS.REJECTED, `Apprise refused the request: ${description}`, {
      status,
    });
  }

  /**
   * Is the API up? GET /status (also proves it is an Apprise API).
   * @returns {Promise<{ attachLock: boolean, stateful: boolean, stateless: boolean }>}
   */
  async check() {
    const status = await this.call('GET', '/status');
    if (typeof status?.stateful_enabled !== 'boolean' && typeof status?.status !== 'object') {
      throw new AppriseError(ERROR_KINDS.NOT_APPRISE, 'No Apprise API at this address');
    }
    return {
      attachLock: status.attach_lock === true || status.attach_size === 0,
      stateful: status.stateful_enabled !== false,
      stateless: status.stateless_enabled !== false,
    };
  }

  /**
   * Sends one notification.
   * @param {{ urls: string[] } | { key: string, tags: string }} target
   * @param {{ body: string, title?: string, type?: string, format?: string, attachment?: object[] }} payload
   * @param {{ timeoutMs?: number }} [options]
   */
  async send(target, payload, { timeoutMs } = {}) {
    if (target?.urls?.length > 0) {
      await this.call('POST', '/notify/', { json: { ...payload, urls: target.urls }, timeoutMs });
      return;
    }
    if (!target?.key) {
      throw new AppriseError(ERROR_KINDS.NO_TARGET, 'Neither Apprise URLs nor a configuration key');
    }
    const json = target.tags ? { ...payload, tag: target.tags } : payload;
    await this.call('POST', `/notify/${checkKey(target.key)}`, { json, timeoutMs });
  }

  /**
   * The services of a stored configuration: their kind and tags, never their URL.
   * @param {string} key
   * @returns {Promise<{ services: Array<{ service: string, tags: string[], enabled: boolean }>, tags: string[] }>}
   */
  async describeConfig(key) {
    const data = await this.call('GET', `/json/urls/${checkKey(key)}`);
    if (data === null) {
      throw new AppriseError(ERROR_KINDS.NO_CONFIG, 'No stored configuration under this key');
    }
    const services = Array.isArray(data.urls) ? data.urls.map(describeService) : [];
    const tags = Array.isArray(data.tags) ? data.tags.filter((tag) => typeof tag === 'string') : [];
    return { services, tags };
  }
}

// The four reasons a delivery fails, as the "Delivery failed" trigger and the
// widget name them: the stable values of the trigger filter.
export const FAILURE_REASONS = ['unreachable', 'configuration', 'service_failed', 'rejected'];

/**
 * The failure reason of an error kind (anything unknown is "rejected").
 * @param {string|undefined} kind
 * @returns {string} one of FAILURE_REASONS
 */
export function failureReason(kind) {
  if (UNREACHABLE_KINDS.has(kind)) {
    return 'unreachable';
  }
  if (
    [
      ERROR_KINDS.NO_SERVER,
      ERROR_KINDS.INVALID_URL,
      ERROR_KINDS.INVALID_KEY,
      ERROR_KINDS.NO_TARGET,
      ERROR_KINDS.UNAUTHORIZED,
      ERROR_KINDS.NO_CONFIG,
      ERROR_KINDS.NO_MATCH,
      ERROR_KINDS.INVALID_URLS,
    ].includes(kind)
  ) {
    return 'configuration';
  }
  if (kind === ERROR_KINDS.SERVICE_FAILED) {
    return 'service_failed';
  }
  return 'rejected';
}
