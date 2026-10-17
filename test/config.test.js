import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  contactTarget,
  normalizeConfig,
  normalizeTags,
  parseType,
  parseUrls,
  sharedTarget,
} from '../src/config.js';

test('the configuration gets its defaults and its types', () => {
  const config = normalizeConfig({});
  assert.deepEqual(config, { ...DEFAULT_CONFIG, config_key: '', urls: [] });
  assert.deepEqual(normalizeConfig(null).urls, []);
  const typed = normalizeConfig({
    server_url: ' http://192.0.2.10:8000 ',
    config_key: ' home ',
    default_tags: 'family ;ops  admin',
    urls: 'tgram://a/b\n mailto://c ',
    notification_type: 'WARNING',
    markdown: false,
    allow_self_signed: true,
    language: 'de',
  });
  assert.equal(typed.server_url, 'http://192.0.2.10:8000');
  assert.equal(typed.config_key, 'home');
  assert.equal(typed.default_tags, 'family, ops admin');
  assert.deepEqual(typed.urls, ['tgram://a/b', 'mailto://c']);
  assert.equal(typed.notification_type, 'warning');
  assert.equal(typed.markdown, false);
  assert.equal(typed.language, 'de');
  assert.equal(normalizeConfig({ language: 'it', notification_type: 'x' }).language, 'fr');
});

test('URLs, tags and types as typed in a form', () => {
  assert.deepEqual(parseUrls('a://1, b://2;c://3  d://4'), ['a://1', 'b://2', 'c://3', 'd://4']);
  assert.deepEqual(parseUrls(null), []);
  assert.equal(normalizeTags(' a , ,b  c '), 'a, b c');
  assert.equal(normalizeTags(undefined), '');
  assert.equal(parseType(' Failure '), 'failure');
  assert.equal(parseType('default'), null);
});

test('the shared destination: URLs first, else the key and the shared tags', () => {
  assert.deepEqual(sharedTarget(normalizeConfig({ config_key: 'k', default_tags: 't' })), {
    key: 'k',
    tags: 't',
  });
  assert.deepEqual(sharedTarget(normalizeConfig({ config_key: 'k', urls: 'a://b' })), {
    urls: ['a://b'],
  });
});

test('the "My account" values of a user', () => {
  const config = normalizeConfig({ config_key: 'home', default_tags: 'family' });
  assert.deepEqual(contactTarget({ tags: 'alice' }, config), {
    optedIn: true,
    target: { key: 'home', tags: 'alice' },
  });
  assert.deepEqual(contactTarget({ tags: 'alice', urls: 'a://b' }, config), {
    optedIn: true,
    target: { urls: ['a://b'] },
  });
  // A secret left untouched reaches the integration as null.
  assert.equal(contactTarget({ tags: 'alice', urls: null }, config).optedIn, true);
  assert.deepEqual(contactTarget({ tags: '', urls: '' }, config), { optedIn: false, target: null });
  assert.deepEqual(contactTarget(undefined, config), { optedIn: false, target: null });
});
