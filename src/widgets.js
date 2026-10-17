// -----------------------------------------------------------------------------
// Dashboard widget "Apprise" (manifest `widgets`, key `apprise`): is the API
// up, how many notifications went out today and how many failed (and why), the
// last notifications sent by scenes, and a button sending a test notification.
//
// Budget of the core: 8 components, 1 focal, 2 texts, 1 status, 4 buttons.
// Here: 1 status, 1 card-list (or 1 caption when empty), 1 button.
// The messages Gladys sends to ONE user are counted, never listed (see
// src/history.js).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FAILURE_REASONS, failureReason } from './apprise/client.js';
import { SERVER_STATES } from './history.js';
import { pick } from './texts.js';

export const WIDGET_KEY = 'apprise';
export const TEST_ACTION = 'test';

// Short texts of the widget: labels of status rows (≤ 40), badges (≤ 16),
// button (≤ 24), caption (≤ 80).
export const TEXT = {
  server: { en: 'Apprise API', fr: 'API Apprise', de: 'Apprise-API', es: 'API Apprise' },
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  unknown: { en: 'Checking…', fr: 'Vérification…', de: 'Wird geprüft…', es: 'Comprobando…' },
  notConfigured: {
    en: 'Not configured',
    fr: 'Non configuré',
    de: 'Nicht konfiguriert',
    es: 'Sin configurar',
  },
  sent: {
    en: 'Sent today',
    fr: "Envoyées aujourd'hui",
    de: 'Heute gesendet',
    es: 'Enviadas hoy',
  },
  failed: {
    en: 'Failed today',
    fr: "Échecs aujourd'hui",
    de: 'Heute fehlgeschlagen',
    es: 'Fallidas hoy',
  },
  lastError: { en: 'Last failure', fr: 'Dernier échec', de: 'Letzter Fehler', es: 'Último fallo' },
  notDelivered: { en: 'Not sent', fr: 'Non envoyée', de: 'Nicht gesendet', es: 'No enviada' },
  test: {
    en: 'Send a test',
    fr: 'Envoyer un test',
    de: 'Test senden',
    es: 'Enviar una prueba',
  },
  empty: {
    en: 'No notification sent by a scene yet.',
    fr: "Aucune notification envoyée par une scène pour l'instant.",
    de: 'Noch keine Benachrichtigung von einer Szene gesendet.',
    es: 'Ninguna escena ha enviado todavía una notificación.',
  },
};

// The failure reasons (src/apprise/client.js), short enough for a status row.
export const REASON_TEXT = {
  unreachable: {
    en: 'Server unreachable',
    fr: 'Serveur injoignable',
    de: 'Server nicht erreichbar',
    es: 'Servidor inaccesible',
  },
  configuration: {
    en: 'Configuration to check',
    fr: 'Configuration à vérifier',
    de: 'Konfiguration prüfen',
    es: 'Revisar la configuración',
  },
  service_failed: {
    en: 'A service failed',
    fr: 'Un service a échoué',
    de: 'Ein Dienst ist gescheitert',
    es: 'Un servicio ha fallado',
  },
  rejected: {
    en: 'Notification refused',
    fr: 'Notification refusée',
    de: 'Benachrichtigung abgelehnt',
    es: 'Notificación rechazada',
  },
};

// The Apprise notification types, as badges (≤ 16).
export const TYPE_TEXT = {
  info: { en: 'Info', fr: 'Info', de: 'Info', es: 'Info' },
  success: { en: 'Success', fr: 'Succès', de: 'Erfolg', es: 'Éxito' },
  warning: { en: 'Warning', fr: 'Avertissement', de: 'Warnung', es: 'Aviso' },
  failure: { en: 'Failure', fr: 'Échec', de: 'Fehler', es: 'Fallo' },
};

if (FAILURE_REASONS.some((reason) => !REASON_TEXT[reason])) {
  throw new Error('REASON_TEXT must name every failure reason');
}

const TYPE_COLORS = {
  info: WIDGET_COLORS.NEUTRAL,
  success: WIDGET_COLORS.SUCCESS,
  warning: WIDGET_COLORS.WARNING,
  failure: WIDGET_COLORS.DANGER,
};

function serverRow(server, configured, language) {
  const value = (key) => pick(TEXT[key], language);
  if (!configured) {
    return { label: value('server'), value: value('notConfigured'), color: WIDGET_COLORS.WARNING };
  }
  if (server.state === SERVER_STATES.ONLINE) {
    return {
      label: value('server'),
      value: value('online'),
      color: WIDGET_COLORS.SUCCESS,
      icon: 'check-circle',
    };
  }
  if (server.state === SERVER_STATES.OFFLINE) {
    return {
      label: value('server'),
      value: value('offline'),
      color: WIDGET_COLORS.DANGER,
      icon: 'alert-triangle',
    };
  }
  return { label: value('server'), value: value('unknown'), color: WIDGET_COLORS.NEUTRAL };
}

/** First line of a message, as a title when the notification has none. */
const firstLine = (text) => {
  const line = (text ?? '').split('\n').find((part) => part.trim() !== '') ?? '';
  const characters = Array.from(line.trim());
  return characters.length > 60 ? `${characters.slice(0, 59).join('')}…` : line.trim();
};

function notificationItem(entry, language) {
  const item = {
    title: entry.title || firstLine(entry.message) || 'Apprise',
    date: entry.at,
    description: entry.message,
  };
  if (!entry.delivered) {
    item.badge = { text: pick(TEXT.notDelivered, language), color: WIDGET_COLORS.DANGER };
  } else if (TYPE_TEXT[entry.type]) {
    item.badge = { text: pick(TYPE_TEXT[entry.type], language), color: TYPE_COLORS[entry.type] };
  }
  return item;
}

/**
 * The content of the widget.
 * @param {object} state
 * @param {{ state: string }} state.server
 * @param {boolean} state.configured
 * @param {{ sent: number, failed: number, lastError: { kind: string }|null }} state.today
 * @param {Array<object>} state.recent
 * @param {string} language
 */
export function buildWidgetContent({ server, configured, today, recent }, language) {
  const items = [
    serverRow(server, configured, language),
    { label: pick(TEXT.sent, language), value: today.sent, color: WIDGET_COLORS.NEUTRAL },
    {
      label: pick(TEXT.failed, language),
      value: today.failed,
      color: today.failed > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (today.lastError) {
    items.push({
      label: pick(TEXT.lastError, language),
      value: pick(REASON_TEXT[failureReason(today.lastError.kind)], language),
      color: WIDGET_COLORS.WARNING,
    });
  }
  const components = [{ type: 'status', items }];
  if (recent.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: recent.slice(0, 8).map((entry) => notificationItem(entry, language)),
    });
  } else {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.empty, language) });
  }
  components.push({
    type: 'button',
    label: pick(TEXT.test, language),
    icon: 'send',
    style: 'secondary',
    action: { key: TEST_ACTION, confirm: true },
  });
  return { ttl_seconds: 300, components };
}
