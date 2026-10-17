// -----------------------------------------------------------------------------
// The whole integration against the fake Gladys of the SDK and an in-memory
// Apprise API answering like the real one.
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  ACTION_KEY,
  CHECK_INTERVAL_MS,
  FAILURE_EVENT_INTERVAL_MS,
  MESSAGE_TIMEOUT_MS,
  RECHECK_DELAY_MS,
  SCENE_ACTION_KEY,
  TRIGGERS,
} from '../src/app.js';
import { SERVER_STATES } from '../src/history.js';
import { ERROR_TEXT } from '../src/texts.js';
import { TEST_ACTION, WIDGET_KEY } from '../src/widgets.js';
import { SECRET_URL, USER_URL, createFakeApprise } from './helpers/fakeApprise.js';
import { BASE_CONFIG, createWorld } from './helpers/world.js';

const events = (fake, key) => fake.sceneEvents.filter((event) => event.key === key);
const IMAGE = 'image/jpg;base64,/9j/4AAQSkZJRgABAQ==';

test('connecting checks the server and reports it connected', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE);
  assert.deepEqual(world.fake.sceneEvents, [], 'the first known state is not a transition');
  assert.deepEqual(
    world.timers.pending.map((timer) => timer.delay),
    [CHECK_INTERVAL_MS],
  );
  assert.deepEqual(world.fake.discoveredDevices, [], 'a communication integration has no device');
});

test('without an address, the configuration screen says what to do', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: ERROR_TEXT.no_server,
  });
  assert.equal(world.apprise.calls.length, 0);
});

test('a Gladys message goes to the tags of the user, as Markdown', async (t) => {
  const world = await createWorld({ config: { ...BASE_CONFIG, notification_type: 'warning' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sendMessage(
    { tags: 'alice' },
    { text: 'The **washing machine** is done', file: null },
  );
  assert.deepEqual(ack, { success: true });
  assert.deepEqual(world.apprise.delivered, [
    {
      to: 'json://198.51.100.20:8080/alice',
      body: 'The **washing machine** is done',
      title: '',
      type: 'warning',
      format: 'markdown',
      attachment: null,
    },
  ]);
  const post = world.apprise.calls.find((call) => call.method === 'POST');
  assert.equal(post.path, '/notify/apprise');
  assert.equal(post.json.tag, 'alice');
  assert.equal(post.timeoutMs, MESSAGE_TIMEOUT_MS);
});

test('a user with Apprise URLs of their own gets a stateless notification', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(await world.fake.sendMessage({ urls: USER_URL, tags: 'bob' }, { text: 'Hi' }), {
    success: true,
  });
  const post = world.apprise.calls.find((call) => call.method === 'POST');
  assert.equal(post.path, '/notify/');
  assert.deepEqual(post.json.urls, [USER_URL]);
  assert.equal(post.json.tag, undefined, 'the URLs win over the tags');
});

test('the camera image travels as an attachment', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.sendMessage({ tags: 'ops' }, { text: 'Someone at the door', file: IMAGE });
  assert.deepEqual(world.apprise.delivered[0].attachment, [
    { base64: '/9j/4AAQSkZJRgABAQ==', filename: 'gladys.jpg', mimetype: 'image/jpeg' },
  ]);
});

test('a server refusing attachments gets the text and a line that says so', async (t) => {
  // Known from /status: no attachment is even tried.
  const locked = await createWorld({ apprise: createFakeApprise({ attachLock: true }) });
  t.after(() => locked.app.stop());
  await locked.fake.sendMessage({ tags: 'ops' }, { text: 'Door', file: IMAGE });
  assert.equal(locked.apprise.delivered[0].attachment, null);
  assert.equal(
    locked.apprise.delivered[0].body,
    'Door\n\n_Image not sent: this Apprise server refuses attachments._',
  );
  assert.equal(locked.apprise.calls.filter((call) => call.method === 'POST').length, 1);

  // Locked after the last check: refused once, sent again without it.
  const apprise = createFakeApprise();
  const world = await createWorld({ apprise, config: { ...BASE_CONFIG, language: 'fr' } });
  t.after(() => world.app.stop());
  apprise.attachLock = true;
  assert.deepEqual(await world.fake.sendMessage({ tags: 'ops' }, { text: 'Porte', file: IMAGE }), {
    success: true,
  });
  assert.equal(apprise.calls.filter((call) => call.method === 'POST').length, 2);
  assert.match(apprise.delivered[0].body, /ce serveur Apprise refuse les pièces jointes/);
  // Remembered until the next check: the next image is not tried again.
  await world.fake.sendMessage({ tags: 'ops' }, { text: 'Encore', file: IMAGE });
  assert.equal(apprise.calls.filter((call) => call.method === 'POST').length, 3);
});

test('tags matching no service fail the message, the trigger fires once per 15 minutes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());

  const first = await world.fake.sendMessage({ tags: 'nobody' }, { text: 'a' });
  assert.equal(first.success, false);
  assert.match(first.error, /no service of the configuration has these tags/);
  assert.deepEqual(events(world.fake, TRIGGERS.FAILED), [
    {
      key: TRIGGERS.FAILED,
      data: { reason: 'configuration', origin: 'gladys_message', error: ERROR_TEXT.no_match.en },
    },
  ]);

  // An unknown key: the same reason, still within 15 minutes.
  await world.fake.configUpdated({ ...BASE_CONFIG, config_key: 'other' });
  assert.equal((await world.fake.sendMessage({ tags: 'alice' }, { text: 'b' })).success, false);
  assert.equal(events(world.fake, TRIGGERS.FAILED).length, 1);

  world.clock.time = new Date(world.clock.time.getTime() + FAILURE_EVENT_INTERVAL_MS);
  await world.fake.sendMessage({ tags: 'alice' }, { text: 'c' });
  assert.deepEqual(events(world.fake, TRIGGERS.FAILED)[1].data.error, ERROR_TEXT.no_config.en);
  assert.equal(world.app.history.today().failed, 3);
});

test('a service that fails is its own reason', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sendMessage({ urls: 'json://198.51.100.30/fail' }, { text: 'x' });
  assert.equal(ack.success, false);
  assert.equal(events(world.fake, TRIGGERS.FAILED)[0].data.reason, 'service_failed');
});

test('an answer arriving after 4 s is no failure: Apprise keeps sending', async (t) => {
  const apprise = createFakeApprise();
  const world = await createWorld({ apprise });
  t.after(() => world.app.stop());
  const late = Object.assign(new Error('Timed out after 4000 ms'), {
    code: 'ETIMEDOUT',
    accepted: true,
  });
  apprise.overrides.set('POST /notify/apprise', late);
  assert.deepEqual(await world.fake.sendMessage({ tags: 'alice' }, { text: 'slow' }), {
    success: true,
  });
  assert.deepEqual(world.fake.sceneEvents, []);

  // Not even connected: that one is a failure.
  apprise.overrides.set(
    'POST /notify/apprise',
    Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT', accepted: false }),
  );
  assert.equal((await world.fake.sendMessage({ tags: 'alice' }, { text: 'x' })).success, false);
});

test('the scene action sends to the shared tags, or to the tags of the scene', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction(SCENE_ACTION_KEY, {
    title: 'Front door',
    message: 'Opened while **away**',
    type: 'failure',
  });
  assert.deepEqual(ack, { success: true, data: { outputs: { delivered: true, error: '' } } });
  assert.deepEqual(
    world.apprise.delivered.map((entry) => [entry.to.split('/').pop(), entry.title, entry.type]),
    [
      ['alice', 'Front door', 'failure'],
      ['bob', 'Front door', 'failure'],
    ],
  );
  assert.equal(world.app.history.data.recent[0].title, 'Front door');
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));

  await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'Disk full', tags: 'ops', type: '' });
  assert.equal(world.apprise.delivered[2].to, 'json://198.51.100.20:8080/ops');
  assert.equal(world.apprise.delivered[2].type, 'info', 'empty type: the configured one');
});

test('with shared Apprise URLs, the scene action sends to them', async (t) => {
  const world = await createWorld({ config: { ...BASE_CONFIG, urls: `${SECRET_URL}\n` } });
  t.after(() => world.app.stop());
  await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'x', tags: 'ops' });
  assert.deepEqual(
    world.apprise.delivered.map((entry) => entry.to),
    [SECRET_URL],
  );
});

test('a scene notification that fails is an output, a wrong field fails the action', async (t) => {
  const apprise = createFakeApprise();
  const world = await createWorld({ apprise });
  t.after(() => world.app.stop());
  apprise.down = 'ECONNREFUSED';
  const ack = await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'x' });
  assert.deepEqual(ack.data.outputs, { delivered: false, error: ERROR_TEXT.unreachable.en });
  assert.equal(world.app.history.data.recent[0].delivered, false);
  assert.deepEqual(events(world.fake, TRIGGERS.FAILED)[0].data, {
    reason: 'unreachable',
    origin: 'scene_action',
    error: ERROR_TEXT.unreachable.en,
  });

  const invalid = await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'x', type: 'urgent' });
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /info, success, warning or failure/);
});

test('the test action reports in the four languages', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, true);
  assert.deepEqual(Object.keys(ack.data.message), ['en', 'fr', 'de', 'es']);
  assert.equal(
    ack.data.message.en,
    'Apprise answers. Configuration "apprise": 4 service(s), tags alice, family, bob, ops. Test notification sent.',
  );
  assert.equal(world.apprise.delivered.length, 2, 'to the shared tags: alice and bob');
  assert.equal(world.apprise.delivered[0].title, 'Gladys test');
  assert.equal(world.apprise.delivered[0].format, 'text', 'the test text is plain');
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.ok(!JSON.stringify(ack).includes('198.51.100'), 'no service URL in the report');
});

test('the test action with an unknown key, a locked listing, and a server down', async (t) => {
  const apprise = createFakeApprise();
  const world = await createWorld({ apprise, config: { ...BASE_CONFIG, config_key: 'nope' } });
  t.after(() => world.app.stop());
  let ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(
    ack.data.message.en,
    'Apprise answers. Test notification not sent: no configuration stored under this key in Apprise.',
  );
  assert.equal(apprise.delivered.length, 0);

  await world.fake.configUpdated(BASE_CONFIG);
  apprise.overrides.set('GET /json/urls/apprise', { status: 403, body: { error: 'locked' } });
  ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.data.message.en, 'Apprise answers. Test notification sent.');

  apprise.down = 'ECONNREFUSED';
  ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.data.message.en, 'Apprise cannot be reached: the Apprise API does not answer.');
});

test('the proxy credentials go with every request', async (t) => {
  const world = await createWorld({
    config: {
      ...BASE_CONFIG,
      auth_user: 'gladys',
      auth_password: 'EXAMPLE-password',
      auth_header: 'X-Api-Key: EXAMPLE-key',
    },
  });
  t.after(() => world.app.stop());
  await world.fake.sendMessage({ tags: 'alice' }, { text: 'x' });
  for (const call of world.apprise.calls) {
    assert.equal(
      call.headers.authorization,
      `Basic ${Buffer.from('gladys:EXAMPLE-password').toString('base64')}`,
    );
    assert.equal(call.headers['x-api-key'], 'EXAMPLE-key');
  }
});

test('offline after two failed checks, back online on the next good one', async (t) => {
  const apprise = createFakeApprise();
  const world = await createWorld({ apprise });
  t.after(() => world.app.stop());

  apprise.down = 'ECONNREFUSED';
  await world.timers.runAll(); // the 5-minute check fails once
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE, 'one failure is a blip');
  assert.deepEqual(
    world.timers.pending.map((timer) => timer.delay),
    [RECHECK_DELAY_MS],
  );

  await world.timers.runAll(); // the recheck 30 s later fails too
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  assert.deepEqual(events(world.fake, TRIGGERS.OFFLINE), [
    { key: TRIGGERS.OFFLINE, data: { error: ERROR_TEXT.unreachable.en } },
  ]);
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: ERROR_TEXT.unreachable,
  });

  await world.timers.runAll(); // still down: no second event
  assert.equal(events(world.fake, TRIGGERS.OFFLINE).length, 1);

  apprise.down = null;
  await world.timers.runAll();
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE);
  assert.deepEqual(events(world.fake, TRIGGERS.ONLINE), [{ key: TRIGGERS.ONLINE, data: {} }]);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('a message delivered while offline brings the server back at once', async (t) => {
  const apprise = createFakeApprise();
  const world = await createWorld({ apprise });
  t.after(() => world.app.stop());
  apprise.down = 'ECONNREFUSED';
  await world.timers.runAll();
  await world.timers.runAll();
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  apprise.down = null;
  await world.fake.sendMessage({ tags: 'alice' }, { text: 'hello' });
  await world.app.check();
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE);
  assert.equal(events(world.fake, TRIGGERS.ONLINE).length, 1);
});

test('a restart neither forgets nor repeats a transition', async (t) => {
  const apprise = createFakeApprise();
  const first = await createWorld({ apprise });
  apprise.down = 'ECONNREFUSED';
  await first.timers.runAll();
  await first.timers.runAll();
  await first.app.stop();
  assert.equal(events(first.fake, TRIGGERS.OFFLINE).length, 1);

  const second = await createWorld({ apprise, stored: first.store.data });
  t.after(() => second.app.stop());
  await second.timers.runAll();
  assert.deepEqual(second.fake.sceneEvents, []);
  apprise.down = null;
  await second.timers.runAll();
  assert.equal(events(second.fake, TRIGGERS.ONLINE).length, 1);
});

test('a first failed check after installation announces nothing', async (t) => {
  const apprise = createFakeApprise();
  apprise.down = 'ENOTFOUND';
  const world = await createWorld({ apprise });
  t.after(() => world.app.stop());
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(world.fake.connectionStatus.connected, false);
});

test('a page that is not an Apprise API is reported as such', async (t) => {
  const apprise = createFakeApprise();
  apprise.overrides.set('GET /status', { status: 200, body: 'OK' });
  const world = await createWorld({ apprise });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus.message, ERROR_TEXT.not_apprise);
});

test('a new address forgets the state of the previous server', async (t) => {
  const apprise = createFakeApprise();
  const world = await createWorld({ apprise });
  t.after(() => world.app.stop());
  apprise.down = 'ECONNREFUSED';
  await world.fake.configUpdated({ ...BASE_CONFIG, server_url: 'http://192.0.2.20' });
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  assert.deepEqual(world.fake.sceneEvents, [], 'not the same server: not a transition');
  assert.equal(world.timers.pending.length, 1, 'one timer only');
  assert.ok(!JSON.stringify(world.store.data).includes('192.0.2'), 'no address stored');
});

test('the widget lists scene notifications only, within the budget', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.sendMessage({ tags: 'alice' }, { text: 'Personal message for one user' });
  await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'Garage left open', type: 'warning' });

  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language, units: 'metric' });
    assert.equal(ack.success, true);
    const content = ack.data.content ?? ack.data;
    assert.deepEqual(validateWidgetContent(content), [], language);
    const json = JSON.stringify(content);
    assert.ok(json.includes('Garage left open'));
    assert.ok(!json.includes('Personal message'), 'a message to one user is never listed');
  }
  const ack = await world.fake.widgetGet(WIDGET_KEY, {
    settings: {},
    language: 'en',
    units: 'metric',
  });
  const content = ack.data.content ?? ack.data;
  const status = content.components.find((component) => component.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Apprise API', 'Online'],
      ['Sent today', 2],
      ['Failed today', 0],
    ],
  );
  const list = content.components.find((component) => component.type === 'card-list');
  assert.equal(list.items[0].badge.text, 'Warning');
});

test('the widget when nothing was sent yet, and its test button', async (t) => {
  const world = await createWorld({ config: { server_url: '' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, {
    settings: {},
    language: 'fr',
    units: 'metric',
  });
  const content = ack.data.content ?? ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components.map((component) => component.type),
    ['status', 'text', 'button'],
  );
  assert.equal(content.components[0].items[0].value, 'Non configuré');

  const toast = await world.fake.widgetAction(WIDGET_KEY, TEST_ACTION, {}, { settings: {} });
  assert.equal(toast.success, true);
  for (const text of Object.values(toast.data.message ?? toast.data)) {
    assert.ok(text.length <= 200);
  }
  const unknown = await world.fake.widgetAction(WIDGET_KEY, 'nope', {}, { settings: {} });
  assert.equal(unknown.success, false);
});

test('the counters restart at local midnight', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.sendMessage({ tags: 'alice' }, { text: 'x' });
  assert.equal(world.app.history.today().sent, 1);
  world.clock.time = new Date(world.clock.time.getTime() + 24 * 3600 * 1000);
  assert.equal(world.app.history.today().sent, 0);
});

test('stop clears the timer and stops checking', async () => {
  const world = await createWorld();
  await world.app.stop();
  assert.deepEqual(world.timers.pending, []);
  const calls = world.apprise.calls.length;
  await world.app.check();
  assert.equal(world.apprise.calls.length, calls);
});

test('nothing secret is stored, nor sent to Gladys', async (t) => {
  const world = await createWorld({
    config: { ...BASE_CONFIG, urls: SECRET_URL, auth_password: 'EXAMPLE-password' },
  });
  t.after(() => world.app.stop());
  await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'x' });
  await world.fake.sendMessage({ urls: 'json://198.51.100.30/fail' }, { text: 'y' });
  await world.fake.sendMessage({ urls: USER_URL }, { text: 'z' });
  await world.fake.action(ACTION_KEY, {});
  const everything = JSON.stringify([
    world.store.data,
    world.fake.connectionStatuses,
    world.fake.sceneEvents,
    world.fake.acks ?? null,
  ]);
  for (const secret of ['EXAMPLE', 'tgram', 'pover', '198.51.100']) {
    assert.ok(!everything.includes(secret), secret);
  }
});

test('a user who emptied "My account" receives nothing, not even the shared destination', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sendMessage({ tags: '', urls: '' }, { text: 'private' });
  assert.deepEqual(ack, { success: true });
  assert.deepEqual(world.apprise.delivered, []);
  assert.equal(world.app.history.today().sent, 0);
});

test('a check of the previous server ending after a new address is ignored', async (t) => {
  // Server A answers, server B (192.0.2.40) is down.
  const apprise = createFakeApprise();
  const request = async (url, options) => {
    if (url.startsWith('http://192.0.2.40')) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    return apprise.request(url, options);
  };
  const world = await createWorld({
    apprise: { ...apprise, request },
    config: { ...BASE_CONFIG, server_url: 'http://192.0.2.40' },
  });
  t.after(() => world.app.stop());

  // The check of A succeeds, then hangs while reporting to Gladys…
  let release;
  const original = world.gladys.setConnectionStatus.bind(world.gladys);
  t.mock.method(world.gladys, 'setConnectionStatus', async (...args) => {
    if (!release) {
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    return original(...args);
  });
  const switchToA = world.fake.configUpdated({ ...BASE_CONFIG, server_url: 'http://192.0.2.30' });
  for (let i = 0; i < 50 && !release; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(release, 'the check of A is reporting');
  // …while the user switches back to B.
  const switchToB = world.fake.configUpdated({ ...BASE_CONFIG, server_url: 'http://192.0.2.40' });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await Promise.all([switchToA, switchToB]);
  await world.app.check();

  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE, 'B was never online');
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(world.fake.connectionStatus.connected, false);
});
