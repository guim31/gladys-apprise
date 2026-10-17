// -----------------------------------------------------------------------------
// An in-memory Apprise API answering with the real answers captured in
// test/fixtures/apprise/: a drop-in replacement of src/apprise/http.js.
//
// Tags behave like apprise-api 2.0.1: "a, b" reaches a or b, "a b" the
// services that have both, "all" every service, no tag the untagged ones.
// A service URL containing "fail" fails (424).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const SERVER_URL = 'http://192.0.2.10:8000';
export const SECRET_URL = 'tgram://123456:EXAMPLE-bot-token/987654';
export const USER_URL = 'pover://EXAMPLE-user@EXAMPLE-token';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/apprise/${name}.json`, import.meta.url), 'utf8'));

const answer = ({ status, body }) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body),
});

/** The services of a configuration reached by a tag expression. */
export function matchTags(services, tag) {
  const expression = typeof tag === 'string' ? tag.trim() : '';
  if (expression === '') {
    return services.filter((service) => service.tags.length === 0);
  }
  const groups = expression.split(',').map((group) => group.trim().split(/\s+/));
  return services.filter((service) =>
    groups.some((group) => group.every((name) => name === 'all' || service.tags.includes(name))),
  );
}

export function defaultConfigs() {
  return {
    apprise: [
      { url: 'json://198.51.100.20:8080/alice', tags: ['alice', 'family'] },
      { url: 'json://198.51.100.20:8080/bob', tags: ['bob', 'family'] },
      { url: 'json://198.51.100.20:8080/ops', tags: ['ops'] },
      { url: 'json://198.51.100.20:8080/house', tags: [] },
    ],
  };
}

export function createFakeApprise({ configs = defaultConfigs(), attachLock = false } = {}) {
  const fake = {
    /** Every request received: { method, path, headers, json, insecure, timeoutMs }. */
    calls: [],
    /** What each service received: { to, body, title, type, format, attachment }. */
    delivered: [],
    configs,
    attachLock,
    /** A network error code (ECONNREFUSED…) to throw, or null. */
    down: null,
    /** Replaces the answer of one "METHOD /path": a function of the call, or a fixed answer. */
    overrides: new Map(),

    deliver(services, json) {
      const failed = services.filter((service) => service.url.includes('fail'));
      for (const service of services.filter((entry) => !failed.includes(entry))) {
        fake.delivered.push({
          to: service.url,
          body: json.body,
          title: json.title ?? '',
          type: json.type ?? 'info',
          format: json.format ?? 'text',
          attachment: json.attachment ?? null,
        });
      }
      if (services.length === 0) {
        return answer(fixture('notify-no-match'));
      }
      return answer(fixture(failed.length > 0 ? 'notify-service-failed' : 'notify-sent'));
    },

    notify(path, json) {
      if (!json?.body) {
        return answer(fixture('notify-empty-body'));
      }
      if (json.attachment && fake.attachLock) {
        return answer(fixture('notify-bad-attachment'));
      }
      if (path === '/notify/') {
        const urls = (Array.isArray(json.urls) ? json.urls : [json.urls]).filter((url) =>
          /^[a-z]+:\/\/./.test(url ?? ''),
        );
        if (urls.length === 0) {
          return answer(fixture('notify-no-valid-url'));
        }
        return fake.deliver(
          urls.map((url) => ({ url, tags: [] })),
          json,
        );
      }
      const services = fake.configs[path.slice('/notify/'.length)];
      if (!services) {
        return answer(fixture('notify-no-config'));
      }
      return fake.deliver(matchTags(services, json.tag), json);
    },

    async request(url, { method = 'GET', headers = {}, json, insecure, timeoutMs } = {}) {
      const target = new URL(url);
      const path = target.pathname.replace(/^\/apprise/, '');
      const call = { method, url, path, headers, json, insecure, timeoutMs };
      fake.calls.push(call);
      if (fake.down) {
        const error = new Error(`connect ${fake.down}`);
        error.code = fake.down;
        throw error;
      }
      const override = fake.overrides.get(`${method} ${path}`);
      if (override) {
        if (override instanceof Error) {
          throw override;
        }
        return answer(typeof override === 'function' ? override(call) : override);
      }
      if (method === 'GET' && path === '/status') {
        return answer(fixture(fake.attachLock ? 'status-attach-locked' : 'status'));
      }
      if (method === 'POST' && path.startsWith('/notify/')) {
        return fake.notify(path, json);
      }
      if (method === 'GET' && path.startsWith('/json/urls/')) {
        const services = fake.configs[path.slice('/json/urls/'.length)];
        if (!services) {
          return answer({ status: 204 });
        }
        const tags = [...new Set(services.flatMap((service) => service.tags))];
        return answer({
          status: 200,
          body: {
            tags,
            urls: services.map((service, index) => ({
              id: `0000000${index}`,
              service_name: 'JSON',
              enabled: true,
              url: service.url,
              tags: service.tags,
            })),
          },
        });
      }
      return { status: 404, headers: { 'content-type': 'text/html' }, body: '<html>404</html>' };
    },
  };
  fake.request = fake.request.bind(fake);
  return fake;
}

/** A store kept in memory (same interface as src/store.js). */
export function createMemoryStore(initial = {}) {
  return {
    data: structuredClone(initial),
    saves: 0,
    async load() {
      return structuredClone(this.data);
    },
    save(data) {
      this.data = structuredClone(data);
      this.saves += 1;
      return Promise.resolve();
    },
    flush() {
      return Promise.resolve();
    },
  };
}

/** Timers run by hand: `timers.pending` lists them, `timers.run()` fires the due ones. */
export function createManualTimers() {
  const timers = {
    pending: [],
    set(callback, delay) {
      const timer = { callback, delay };
      timers.pending.push(timer);
      return timer;
    },
    clear(timer) {
      timers.pending = timers.pending.filter((entry) => entry !== timer);
    },
    /** Fires every pending timer once; resolves once the callbacks settled. */
    async runAll() {
      const due = timers.pending;
      timers.pending = [];
      due.forEach((timer) => timer.callback());
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
  return timers;
}
