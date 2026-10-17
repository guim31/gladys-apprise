// -----------------------------------------------------------------------------
// Integration configuration (the `config_schema` of the manifest) and the
// per-user "My account" values (`contact_schema`), normalized so the rest of
// the code never deals with `undefined`, strings typed with spaces or lists
// typed with semicolons.
//
// Where a notification goes (a "target"):
// - Apprise URLs given in the form: sent as they are (POST /notify/), the
//   tags are then meaningless;
// - otherwise the stored configuration of apprise-api under `config_key`,
//   with tags (POST /notify/{key}).
// -----------------------------------------------------------------------------

import { NOTIFICATION_TYPES } from './apprise/client.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js).
export const DEFAULT_CONFIG = {
  server_url: '',
  config_key: 'apprise',
  default_tags: '',
  urls: '',
  notification_type: 'info',
  markdown: true,
  auth_user: '',
  auth_password: '',
  auth_header: '',
  allow_self_signed: false,
  language: 'fr',
};

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Apprise URLs typed in a form: one per line, or separated by spaces or
 * commas, as Apprise itself splits them (a ";" may be part of a password).
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseUrls(value) {
  return trimmed(value)
    .split(/[\s,]+/)
    .filter((url) => url !== '');
}

/**
 * Tags as apprise-api reads them: "a, b" is a OR b, "a b" is a AND b. The
 * user may type semicolons for commas; spaces around separators are tidied.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTags(value) {
  return trimmed(value)
    .split(/[,;]/)
    .map((group) => group.trim().split(/\s+/).filter(Boolean).join(' '))
    .filter((group) => group !== '')
    .join(', ');
}

/** A notification type of Apprise, or null (the configured default). */
export function parseType(value) {
  const text = trimmed(value).toLowerCase();
  return NOTIFICATION_TYPES.includes(text) ? text : null;
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = raw ?? {};
  return {
    server_url: trimmed(config.server_url),
    // Emptied by the user: the default key, as the form shows it.
    config_key: trimmed(config.config_key) || DEFAULT_CONFIG.config_key,
    default_tags: normalizeTags(config.default_tags),
    urls: parseUrls(config.urls),
    notification_type: parseType(config.notification_type) ?? DEFAULT_CONFIG.notification_type,
    markdown: config.markdown !== false,
    auth_user: trimmed(config.auth_user),
    auth_password: typeof config.auth_password === 'string' ? config.auth_password : '',
    auth_header: trimmed(config.auth_header),
    allow_self_signed: config.allow_self_signed === true,
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
  };
}

/**
 * Where the shared notifications go: the scene action, the test, and the
 * messages of a user who chose "the shared destination".
 * @param {ReturnType<typeof normalizeConfig>} config
 */
export function sharedTarget(config) {
  if (config.urls.length > 0) {
    return { urls: config.urls };
  }
  return { key: config.config_key, tags: config.default_tags };
}

/**
 * The "My account" values of one user, as Gladys hands them to onSendMessage,
 * and where that user's messages go.
 * @param {Record<string, unknown>} [contact]
 * @param {ReturnType<typeof normalizeConfig>} config
 * @returns {{ optedIn: boolean, target: object|null }}
 */
export function contactTarget(contact, config) {
  const values = contact ?? {};
  const urls = parseUrls(values.urls);
  const tags = normalizeTags(values.tags);
  // The core skips a user who never saved "My account", but not one who
  // saved it with every field emptied ({ tags: '' }): that user opted out.
  if (urls.length > 0) {
    return { optedIn: true, target: { urls } };
  }
  if (tags !== '') {
    return { optedIn: true, target: { key: config.config_key, tags } };
  }
  return { optedIn: false, target: null };
}
