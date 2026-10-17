// -----------------------------------------------------------------------------
// The integration: wires the Gladys SDK to the Apprise API client.
//
// - onSendMessage: Gladys sends a message to ONE user (a scene "Send a
//   message", the replies of the brain, the system messages). The user's
//   "My account" values (contact_schema) say where it goes: their own
//   Apprise URLs, or their tags in the stored configuration.
// - Scene action `send_notification`: a notification with a title and a
//   type, to the shared destination or to the tags chosen in the scene.
// - Action `test_connection` and the widget button: check the server, say
//   what the destination holds, send a test notification.
// - A health check every 5 minutes (GET /status): the connection status of
//   the Configuration screen, the widget, and the `server_offline` /
//   `server_online` triggers. Offline is declared after two failed checks
//   30 s apart, never on one blip.
// - Trigger `delivery_failed`: at most once per reason per 15 minutes, so a
//   scene answering it with another Apprise notification cannot loop.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { contactTarget, normalizeConfig, normalizeTags, sharedTarget } from './config.js';
import {
  AppriseClient,
  AppriseError,
  ERROR_KINDS,
  UNREACHABLE_KINDS,
  authHeaders,
  failureReason,
} from './apprise/client.js';
import {
  InvalidMessageError,
  fromGladysMessage,
  fromSceneAction,
  withoutAttachment,
} from './apprise/message.js';
import { httpRequest } from './apprise/http.js';
import { History, SERVER_STATES } from './history.js';
import { createFailureLog } from './log.js';
import { Store } from './store.js';
import { REPORT_TEXT, each, errorText, errorTexts } from './texts.js';
import { TEST_ACTION, WIDGET_KEY, buildWidgetContent } from './widgets.js';

const logger = createLogger({ name: 'apprise' });

export const ACTION_KEY = 'test_connection';
export const SCENE_ACTION_KEY = 'send_notification';
export const TRIGGERS = {
  OFFLINE: 'server_offline',
  ONLINE: 'server_online',
  FAILED: 'delivery_failed',
};

export const CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const RECHECK_DELAY_MS = 30 * 1000;
export const FAILURE_EVENT_INTERVAL_MS = 15 * 60 * 1000;
// Gladys waits 5 s for the ack of a message: answer before, even if Apprise
// is slow. A late answer to a fully written request is no failure (see send).
export const MESSAGE_TIMEOUT_MS = 4000;
export const ACTION_TIMEOUT_MS = 15_000;

/** A stable fingerprint of the server address, stored instead of the address itself. */
const fingerprint = (client) =>
  client ? createHash('sha256').update(client.base.href).digest('hex').slice(0, 16) : null;

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options] replaced by the tests
 * @param {typeof httpRequest} [options.request]
 * @param {{ load(): Promise<object>, save(data: object): Promise<void>, flush(): Promise<void> }} [options.store]
 * @param {() => Date} [options.now]
 * @param {typeof setTimeout} [options.setTimer]
 * @param {typeof clearTimeout} [options.clearTimer]
 */
export function registerHandlers(gladys, options = {}) {
  const {
    request = httpRequest,
    store = new Store(),
    now = () => new Date(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = options;

  const history = new History({ store, now });
  const loaded = history.load();

  let config = normalizeConfig({});
  let client = null;
  let configError = new AppriseError(ERROR_KINDS.NO_SERVER, 'Not configured yet');
  let attachLock = false; // the server refuses attachments (GET /status)
  let generation = 0; // bumped at each configuration: stale checks are ignored
  let failures = 0; // consecutive failed checks
  let timer = null;
  let checking = null;
  let stopped = false;
  let lastStatus = null; // the last connection status published, to publish changes only
  const lastFailureEvent = new Map(); // reason → time of the last delivery_failed event
  // Logs, at info level the lifecycle only: what this process last said of the
  // server (null: nothing yet, or a new address), and repeated failures once.
  let loggedState = null;
  const statusLog = createFailureLog(logger, { recovered: 'Connection status published again' });
  const checkLog = createFailureLog(logger, { level: 'error' });

  // --- Gladys side effects, never fatal --------------------------------------

  async function publishStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === lastStatus || !gladys.connected) {
      return;
    }
    try {
      await gladys.setConnectionStatus(connected, message);
      lastStatus = key;
      statusLog.ok();
    } catch (err) {
      // Retried at each check until it passes: one line, not one per check.
      statusLog.fail(`Cannot publish the connection status: ${err.message}`);
    }
  }

  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Cannot fire the "${key}" trigger: ${err.message}`);
    }
  }

  function refreshWidget() {
    try {
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not requested: ${err.message}`);
    }
  }

  // --- Server state ------------------------------------------------------------

  function schedule(delay) {
    if (timer) {
      clearTimer(timer);
    }
    timer = stopped
      ? null
      : setTimer(() => {
          timer = null;
          check()
            .then(() => checkLog.ok())
            .catch((err) => checkLog.fail('Health check failed', err));
        }, delay);
    timer?.unref?.();
  }

  async function setServerState(state, { error, address, current }) {
    await loaded;
    if (current !== generation) {
      return; // the configuration changed meanwhile: this result is about another server
    }
    const previous = history.setServer({ state, address });
    if (previous === state) {
      return;
    }
    refreshWidget();
    // Transitions only: the first state known after an installation or a new
    // address is not news.
    if (previous === SERVER_STATES.ONLINE && state === SERVER_STATES.OFFLINE) {
      await fire(TRIGGERS.OFFLINE, { error: errorText(error, config.language) });
    } else if (previous === SERVER_STATES.OFFLINE && state === SERVER_STATES.ONLINE) {
      await fire(TRIGGERS.ONLINE, {});
    }
  }

  /**
   * One line when this process first knows the state of the server, then one
   * per change, whatever was persisted: a restart says where it stands, and a
   * server down for days writes nothing at each check.
   */
  function logServerState(state, { error } = {}) {
    if (state === loggedState) {
      return;
    }
    const first = loggedState === null;
    loggedState = state;
    if (state === SERVER_STATES.ONLINE) {
      logger.info(first ? 'Connected to the Apprise API' : 'The Apprise API is back online');
    } else {
      logger.warn(
        first
          ? `The Apprise API does not answer: ${error?.message}`
          : `The Apprise API is offline: ${error?.message}`,
      );
    }
  }

  async function runCheck() {
    const current = generation;
    if (!client) {
      failures = 0;
      await publishStatus(false, errorTexts(configError));
      refreshWidget();
      return;
    }
    // The client and its address are captured: applyConfig may replace them
    // during any await below, and the generation check then drops the result.
    const checked = client;
    const address = fingerprint(checked);
    try {
      const status = await checked.check();
      if (current !== generation) {
        return;
      }
      failures = 0;
      attachLock = status.attachLock;
      await setServerState(SERVER_STATES.ONLINE, { address, current });
      if (current === generation) {
        logServerState(SERVER_STATES.ONLINE);
        await publishStatus(true);
      }
    } catch (err) {
      if (current !== generation) {
        return;
      }
      failures += 1;
      logger.debug(`Health check of ${checked.description} failed: ${err.message}`);
      if (failures >= 2 || history.server.state !== SERVER_STATES.ONLINE) {
        await setServerState(SERVER_STATES.OFFLINE, { error: err, address, current });
        if (current === generation) {
          logServerState(SERVER_STATES.OFFLINE, { error: err });
          await publishStatus(false, errorTexts(err));
        }
      }
    } finally {
      if (current === generation) {
        schedule(failures === 1 ? RECHECK_DELAY_MS : CHECK_INTERVAL_MS);
      }
    }
  }

  /** One check at a time; a check requested meanwhile runs right after. */
  function check() {
    if (stopped) {
      return Promise.resolve();
    }
    if (!checking) {
      checking = runCheck().finally(() => {
        checking = null;
      });
    }
    return checking;
  }

  async function applyConfig(raw) {
    config = normalizeConfig(raw);
    generation += 1;
    failures = 0;
    loggedState = null; // a saved configuration says again where the server stands
    attachLock = false;
    try {
      client = new AppriseClient({
        serverUrl: config.server_url,
        headers: authHeaders(config),
        insecure: config.allow_self_signed,
        request,
      });
      configError = null;
    } catch (err) {
      client = null;
      configError = err;
    }
    await loaded;
    if (history.server.address !== fingerprint(client)) {
      // Another server: what was known of the previous one no longer holds.
      history.setServer({ state: SERVER_STATES.UNKNOWN, address: fingerprint(client) });
    }
    await checking; // let a check of the previous configuration end (its result is ignored)
    await check();
  }

  // --- Deliveries ----------------------------------------------------------------

  async function afterDelivery({ origin, delivered, error, notification }) {
    await loaded;
    history.record({ origin, delivered, kind: error?.kind, notification });
    refreshWidget();
    if (delivered) {
      if (history.server.state !== SERVER_STATES.ONLINE) {
        check().catch(() => {});
      }
      return;
    }
    if (UNREACHABLE_KINDS.has(error?.kind) && history.server.state === SERVER_STATES.ONLINE) {
      check().catch(() => {});
    }
    if (origin === 'test') {
      return; // the user is looking at the result already
    }
    const reason = failureReason(error instanceof InvalidMessageError ? undefined : error?.kind);
    const last = lastFailureEvent.get(reason);
    if (last !== undefined && now().getTime() - last < FAILURE_EVENT_INTERVAL_MS) {
      return;
    }
    lastFailureEvent.set(reason, now().getTime());
    const event = fire(TRIGGERS.FAILED, {
      reason,
      origin,
      error: errorText(error, config.language),
    });
    // A Gladys message is acked within 5 s: its trigger is not waited for
    // (fire never rejects).
    if (origin !== 'gladys_message') {
      await event;
    }
  }

  function requireClient() {
    if (!client) {
      throw configError;
    }
    return client;
  }

  /**
   * Sends one notification. The image is left out (with a line saying so)
   * when the server refuses attachments, known from /status or from its
   * answer. Resolves `{ confirmed }`: false when Apprise received the whole
   * request but did not answer in time (it goes on sending).
   */
  async function deliver(sender, target, payload, { timeoutMs, language }) {
    // One deadline for both tries: a Gladys message is acked within 5 s.
    const deadline = Date.now() + timeoutMs;
    const send = async (body) => {
      try {
        await sender.send(target, body, { timeoutMs: Math.max(1, deadline - Date.now()) });
        return true;
      } catch (err) {
        if (err?.accepted) {
          logger.debug(`Apprise did not confirm within ${timeoutMs} ms: ${err.message}`);
          return false;
        }
        throw err;
      }
    };
    const body = attachLock ? withoutAttachment(payload, language) : payload;
    try {
      return { confirmed: await send(body) };
    } catch (err) {
      if (err?.kind !== ERROR_KINDS.BAD_ATTACHMENT || !body.attachment) {
        throw err;
      }
      attachLock = true; // until the next check says otherwise
      return { confirmed: await send(withoutAttachment(body, language)) };
    }
  }

  /** What the shared destination holds, for the test report (null: cannot say). */
  async function describeTarget(tested, target) {
    if (target.urls) {
      return each(REPORT_TEXT, (text) => text.urls(target.urls.length));
    }
    if (!target.key) {
      throw new AppriseError(ERROR_KINDS.NO_TARGET, 'No destination');
    }
    try {
      const { services, tags } = await tested.describeConfig(target.key);
      const shown = tags.slice(0, 8).join(', ');
      return each(REPORT_TEXT, (text) => text.config(target.key, services.length, shown));
    } catch (err) {
      if ([ERROR_KINDS.NO_CONFIG, ERROR_KINDS.INVALID_KEY].includes(err?.kind)) {
        throw err;
      }
      // A locked configuration (APPRISE_CONFIG_LOCK) cannot be listed: not a failure.
      logger.debug(`Configuration not listed: ${err.message}`);
      return null;
    }
  }

  /** Sends the test notification to the shared destination: the action and the widget button. */
  async function testConnection() {
    // Captured once: a configuration saved during the test must not mix servers.
    const tested = client;
    const settings = config;
    const failure = configError;
    try {
      if (!tested) {
        throw failure;
      }
      await tested.check();
    } catch (err) {
      check().catch(() => {});
      return each(REPORT_TEXT, (text, lang) => text.unreachable(errorText(err, lang)));
    }
    check().catch(() => {});
    const target = sharedTarget(settings);
    const prefix = (described) => (text, lang) =>
      described ? `${text.reachable} ${described[lang]}` : text.reachable;
    let described = null;
    try {
      described = await describeTarget(tested, target);
      const text = REPORT_TEXT[settings.language];
      const { confirmed } = await deliver(
        tested,
        target,
        fromSceneAction(
          { title: text.title, message: text.message },
          { ...settings, markdown: false },
        ),
        { timeoutMs: ACTION_TIMEOUT_MS, language: settings.language },
      );
      await afterDelivery({ origin: 'test', delivered: true });
      return each(
        REPORT_TEXT,
        (t, lang) => `${prefix(described)(t, lang)} ${confirmed ? t.sent : t.accepted}`,
      );
    } catch (err) {
      await afterDelivery({ origin: 'test', delivered: false, error: err });
      return each(
        REPORT_TEXT,
        (t, lang) => `${prefix(described)(t, lang)} ${t.failed(errorText(err, lang))}`,
      );
    }
  }

  // --- Handlers ----------------------------------------------------------------

  gladys.onSendMessage(async (contact, message) => {
    const { optedIn, target } = contactTarget(contact, config);
    if (!optedIn) {
      // "My account" saved with every field emptied: the user asked for nothing.
      return;
    }
    try {
      const payload = fromGladysMessage(message, {
        type: config.notification_type,
        markdown: config.markdown,
      });
      await deliver(requireClient(), target, payload, {
        timeoutMs: MESSAGE_TIMEOUT_MS,
        language: config.language,
      });
      await afterDelivery({ origin: 'gladys_message', delivered: true });
    } catch (err) {
      logger.warn(`Message not delivered by Apprise: ${err.message}`);
      await afterDelivery({ origin: 'gladys_message', delivered: false, error: err });
      // The core logs this text: the English explanation, never a URL.
      throw new Error(`Apprise: ${errorText(err, 'en')}`, { cause: err });
    }
  });

  gladys.onSceneAction(SCENE_ACTION_KEY, async (fields) => {
    // Invalid fields fail the action (the scene logs it); a delivery failure
    // is an output the scene can test, like the `delivery_failed` trigger.
    const payload = fromSceneAction(fields, config);
    const shared = sharedTarget(config);
    const tags = normalizeTags(fields?.tags);
    // Tags typed in the scene replace the default ones (stored configuration only).
    const target = shared.key !== undefined && tags !== '' ? { ...shared, tags } : shared;
    const notification = { title: payload.title, message: payload.body, type: payload.type };
    try {
      await deliver(requireClient(), target, payload, {
        timeoutMs: ACTION_TIMEOUT_MS,
        language: config.language,
      });
      await afterDelivery({ origin: 'scene_action', delivered: true, notification });
      return { delivered: true, error: '' };
    } catch (err) {
      logger.warn(`Scene notification not delivered by Apprise: ${err.message}`);
      await afterDelivery({ origin: 'scene_action', delivered: false, error: err, notification });
      return { delivered: false, error: errorText(err, config.language) };
    }
  });

  gladys.onAction(ACTION_KEY, () => testConnection());

  gladys.onWidgetGet(WIDGET_KEY, async ({ language }) => {
    await loaded;
    return buildWidgetContent(
      {
        server: history.server,
        configured: client !== null,
        today: history.today(),
        recent: history.data.recent,
      },
      language,
    );
  });

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey) => {
    if (actionKey !== TEST_ACTION) {
      throw new Error(`Unknown widget action "${actionKey}"`);
    }
    const report = await testConnection();
    // A toast holds 200 characters.
    return each(report, (text) => (text.length > 200 ? `${text.slice(0, 199)}…` : text));
  });

  gladys.onConfigUpdated((raw) => applyConfig(raw));

  gladys.on('connected', () => {
    lastStatus = null; // a new connection: publish the status again
    return applyConfig(gladys.config).catch((err) =>
      logger.error('Cannot apply the configuration', err),
    );
  });

  return {
    check,
    history,
    get config() {
      return config;
    },
    async stop() {
      stopped = true;
      generation += 1;
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      await checking;
      await history.flush();
    },
  };
}
