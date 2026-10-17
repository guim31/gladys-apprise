// -----------------------------------------------------------------------------
// The Apprise client against the real answers of apprise-api 2.0.1
// (test/fixtures/apprise/), and every way a request can fail.
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppriseClient,
  AppriseError,
  ERROR_KINDS,
  FAILURE_REASONS,
  authHeaders,
  checkKey,
  describeUrl,
  failureReason,
  parseServerUrl,
} from '../src/apprise/client.js';
import { SECRET_URL, SERVER_URL, createFakeApprise, fixture } from './helpers/fakeApprise.js';

const clientFor = (apprise, serverUrl = SERVER_URL, options = {}) =>
  new AppriseClient({ serverUrl, request: apprise.request, ...options });

async function errorOf(promise) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof AppriseError, `${err} is not an AppriseError`);
    return err;
  }
  assert.fail('no error');
}

const answering = (status, body) => {
  const apprise = createFakeApprise();
  apprise.overrides.set('POST /notify/', { status, body });
  apprise.overrides.set('POST /notify/apprise', { status, body });
  return apprise;
};

test('the server address is normalized, path prefix kept, credentials dropped', () => {
  assert.equal(parseServerUrl(' 192.0.2.10:8000 ').href, 'http://192.0.2.10:8000/');
  assert.equal(
    parseServerUrl('https://me:pw@example.org/apprise/?x=1#a').href,
    'https://example.org/apprise',
  );
  assert.equal(
    describeUrl(parseServerUrl('https://example.org:8443/a')),
    'https://example.org:8443/a',
  );
  assert.equal(
    new AppriseClient({ serverUrl: 'https://example.org/apprise/' }).url('/notify/'),
    'https://example.org/apprise/notify/',
  );
  assert.equal(
    new AppriseClient({ serverUrl: 'http://192.0.2.10' }).url('/status'),
    'http://192.0.2.10/status',
  );
});

test('an empty or invalid address, a bad key: configuration errors', () => {
  assert.throws(() => parseServerUrl(''), { kind: ERROR_KINDS.NO_SERVER });
  assert.throws(() => parseServerUrl('ftp://192.0.2.10'), { kind: ERROR_KINDS.INVALID_URL });
  assert.throws(() => parseServerUrl('http://'), { kind: ERROR_KINDS.INVALID_URL });
  assert.equal(checkKey('my-home_1'), 'my-home_1');
  assert.throws(() => checkKey('../admin'), { kind: ERROR_KINDS.INVALID_KEY });
  assert.throws(() => checkKey(''), { kind: ERROR_KINDS.INVALID_KEY });
});

test('the proxy headers: basic authentication and one custom header', () => {
  assert.deepEqual(authHeaders({}), {});
  assert.deepEqual(authHeaders({ auth_user: 'a', auth_password: 'b' }), {
    authorization: `Basic ${Buffer.from('a:b').toString('base64')}`,
  });
  assert.deepEqual(authHeaders({ auth_header: ' X-Api-Key :  k: v ' }), { 'x-api-key': 'k: v' });
  assert.deepEqual(authHeaders({ auth_header: 'no colon' }), {});
  assert.deepEqual(authHeaders({ auth_header: 'Bad Name: v' }), {});
});

test('check reads /status, and the attachment lock', async () => {
  const apprise = createFakeApprise();
  assert.deepEqual(await clientFor(apprise).check(), {
    attachLock: false,
    stateful: true,
    stateless: true,
  });
  assert.equal(apprise.calls[0].path, '/status');
  apprise.attachLock = true;
  assert.equal((await clientFor(apprise).check()).attachLock, true);
});

test('check refuses what is not an Apprise API', async () => {
  const plain = createFakeApprise();
  plain.overrides.set('GET /status', { status: 200, body: 'OK' });
  assert.equal((await errorOf(clientFor(plain).check())).kind, ERROR_KINDS.NOT_APPRISE);
  const other = createFakeApprise();
  other.overrides.set('GET /status', { status: 200, body: { hello: 'world' } });
  assert.equal((await errorOf(clientFor(other).check())).kind, ERROR_KINDS.NOT_APPRISE);
  const html = createFakeApprise();
  html.overrides.set('GET /status', { status: 404, body: '<html></html>' });
  assert.equal((await errorOf(clientFor(html).check())).kind, ERROR_KINDS.NOT_APPRISE);
});

test('send: stateless with URLs, stored configuration with tags', async () => {
  const apprise = createFakeApprise();
  const client = clientFor(apprise);
  await client.send({ urls: [SECRET_URL] }, { body: 'a' });
  await client.send({ key: 'apprise', tags: 'ops' }, { body: 'b' });
  await client.send({ key: 'apprise', tags: '' }, { body: 'c' });
  assert.deepEqual(
    apprise.calls.map((call) => [call.path, call.json]),
    [
      ['/notify/', { body: 'a', urls: [SECRET_URL] }],
      ['/notify/apprise', { body: 'b', tag: 'ops' }],
      ['/notify/apprise', { body: 'c' }],
    ],
  );
  assert.deepEqual(
    apprise.delivered.map((entry) => entry.to.split('/').pop()),
    ['987654', 'ops', 'house'],
  );
  assert.equal((await errorOf(client.send({}, { body: 'x' }))).kind, ERROR_KINDS.NO_TARGET);
});

test('the answers of a real server are understood', async () => {
  const cases = [
    ['notify-service-failed', ERROR_KINDS.SERVICE_FAILED],
    ['notify-no-match', ERROR_KINDS.NO_MATCH],
    ['notify-no-config', ERROR_KINDS.NO_CONFIG],
    ['notify-no-valid-url', ERROR_KINDS.INVALID_URLS],
    ['notify-empty-body', ERROR_KINDS.REJECTED],
    ['notify-bad-attachment', ERROR_KINDS.BAD_ATTACHMENT],
  ];
  for (const [name, kind] of cases) {
    const { status, body } = fixture(name);
    const err = await errorOf(
      clientFor(answering(status, body)).send({ urls: ['json://x'] }, { body: 'x' }),
    );
    assert.equal(err.kind, kind, name);
    assert.equal(err.status, status);
  }
  await clientFor(answering(200, fixture('notify-sent').body)).send(
    { urls: ['json://x'] },
    {
      body: 'x',
    },
  );
});

test('every failure has a kind, and never shows a URL nor a credential', async () => {
  const network = async (code, message = `connect ${code}`) => {
    const apprise = createFakeApprise();
    apprise.down = code;
    const err = await errorOf(
      clientFor(apprise, SERVER_URL, { headers: { authorization: 'Basic EXAMPLE' } }).send(
        { urls: [SECRET_URL] },
        { body: 'x' },
      ),
    );
    assert.ok(!`${err.message}`.includes('EXAMPLE'), message);
    return err.kind;
  };
  assert.equal(await network('ECONNREFUSED'), ERROR_KINDS.UNREACHABLE);
  assert.equal(await network('DEPTH_ZERO_SELF_SIGNED_CERT'), ERROR_KINDS.TLS);
  for (const [status, kind] of [
    [301, ERROR_KINDS.REDIRECT],
    [401, ERROR_KINDS.UNAUTHORIZED],
    [403, ERROR_KINDS.UNAUTHORIZED],
    [417, ERROR_KINDS.SERVER_ERROR],
    [500, ERROR_KINDS.SERVER_ERROR],
    [418, ERROR_KINDS.REJECTED],
  ]) {
    const err = await errorOf(
      clientFor(answering(status, { error: 'x' })).send({ urls: [SECRET_URL] }, { body: 'x' }),
    );
    assert.equal(err.kind, kind, String(status));
    assert.ok(!err.message.includes('tgram'));
  }
  const long = await errorOf(
    clientFor(answering(400, { error: 'y'.repeat(500) })).send({ urls: ['a://b'] }, { body: 'x' }),
  );
  assert.ok(long.message.length < 260, 'a long server error is shortened');
});

test('a late answer to a written request is flagged accepted', async () => {
  const apprise = createFakeApprise();
  apprise.overrides.set(
    'POST /notify/',
    Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT', accepted: true }),
  );
  const err = await errorOf(clientFor(apprise).send({ urls: ['a://b'] }, { body: 'x' }));
  assert.equal(err.kind, ERROR_KINDS.UNREACHABLE);
  assert.equal(err.accepted, true);
});

test('describeConfig lists services and tags, never the URLs', async () => {
  const apprise = createFakeApprise();
  apprise.overrides.set('GET /json/urls/apprise', fixture('json-urls'));
  const described = await clientFor(apprise).describeConfig('apprise');
  assert.deepEqual(described.tags, ['family', 'ops', 'alice', 'bob']);
  assert.equal(described.services.length, 3);
  assert.ok(!JSON.stringify(described).includes('198.51.100'));
  const missing = await errorOf(clientFor(createFakeApprise()).describeConfig('nope'));
  assert.equal(missing.kind, ERROR_KINDS.NO_CONFIG);
});

test('the self-signed option and the headers reach the request', async () => {
  const apprise = createFakeApprise();
  await clientFor(apprise, 'https://example.org/apprise', {
    insecure: true,
    headers: { 'x-k': 'v' },
  }).check();
  assert.equal(apprise.calls[0].insecure, true);
  assert.equal(apprise.calls[0].url, 'https://example.org/apprise/status');
  assert.deepEqual(apprise.calls[0].headers, { 'x-k': 'v' });
});

test('every error kind has a failure reason', () => {
  for (const kind of Object.values(ERROR_KINDS)) {
    assert.ok(FAILURE_REASONS.includes(failureReason(kind)), kind);
  }
  assert.equal(failureReason(ERROR_KINDS.NO_MATCH), 'configuration');
  assert.equal(failureReason(ERROR_KINDS.SERVICE_FAILED), 'service_failed');
  assert.equal(failureReason(undefined), 'rejected');
});
