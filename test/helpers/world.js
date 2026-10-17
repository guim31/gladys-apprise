// -----------------------------------------------------------------------------
// The integration wired to the fake Gladys of the SDK and to the fake Apprise.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import {
  SERVER_URL,
  createFakeApprise,
  createManualTimers,
  createMemoryStore,
} from './fakeApprise.js';

export const BASE_CONFIG = {
  server_url: SERVER_URL,
  config_key: 'apprise',
  default_tags: 'family',
  language: 'en',
};

export async function createWorld({
  config = BASE_CONFIG,
  stored = {},
  apprise = createFakeApprise(),
  connect = true,
  now,
} = {}) {
  const gladys = createFakeGladys({ config });
  const store = createMemoryStore(stored);
  const timers = createManualTimers();
  const clock = { time: new Date('2026-10-17T10:00:00Z') };
  const app = registerHandlers(gladys, {
    request: apprise.request,
    store,
    now: now ?? (() => new Date(clock.time)),
    setTimer: timers.set,
    clearTimer: timers.clear,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, fake: gladys.fake, apprise, store, timers, clock, app };
}
