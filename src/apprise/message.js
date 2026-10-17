// -----------------------------------------------------------------------------
// Gladys message / scene action → Apprise notification (the body of
// POST /notify/). Pure functions, no I/O.
//
// - Gladys messages are Markdown (the brain and the AI write it): sent with
//   `format: "markdown"`, Apprise converts it for each service (HTML for an
//   e-mail, plain text for an SMS), unless the user turned Markdown off.
// - The image of the "Send a camera image" scene action (`file`, a
//   `image/jpg;base64,…` string) becomes an Apprise attachment. When the
//   server refuses attachments (APPRISE_ATTACH_SIZE=0), the text leaves alone
//   with a line saying so (see withoutAttachment).
// - No title on Gladys messages: each service shows its own default.
// -----------------------------------------------------------------------------

import { parseType } from '../config.js';
import { IMAGE_DROPPED, pick } from '../texts.js';

export const MAX_TITLE_LENGTH = 250;

/** A message the user typed wrong (a scene action field): shown as is. */
export class InvalidMessageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidMessageError';
  }
}

const asText = (value) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

/**
 * The image Gladys hands over (`image/jpg;base64,…`, with or without `data:`)
 * as an Apprise attachment, or null when it is not one.
 * @param {unknown} file
 */
export function parseAttachment(file) {
  if (typeof file !== 'string') {
    return null;
  }
  const match = /^(?:data:)?([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(file.trim());
  if (!match) {
    return null;
  }
  const mimetype = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return {
    base64: match[2].replace(/\s+/g, ''),
    filename: `gladys.${EXTENSIONS[mimetype] ?? 'bin'}`,
    mimetype,
  };
}

const truncate = (text, max) => {
  const characters = Array.from(text);
  return characters.length > max ? `${characters.slice(0, max - 1).join('')}…` : text;
};

/**
 * The Apprise notification for a message Gladys sends to a user (onSendMessage).
 * @param {{ text?: unknown, file?: unknown }} gladysMessage
 * @param {{ type: string, markdown: boolean }} options
 * @returns {{ body: string, type: string, format: string, attachment?: object[] }}
 */
export function fromGladysMessage(gladysMessage, { type, markdown }) {
  const { text, file } = gladysMessage ?? {};
  const body = asText(text);
  const attachment = parseAttachment(file);
  if (body === '' && !attachment) {
    throw new InvalidMessageError('Empty message: nothing to send to Apprise');
  }
  return {
    // Apprise refuses an empty body, even with an attachment.
    body: body === '' ? '📷' : body,
    type,
    format: markdown ? 'markdown' : 'text',
    ...(attachment ? { attachment: [attachment] } : {}),
  };
}

/**
 * The same notification without its attachment, and a line that says so.
 * @param {{ body: string, format: string, attachment?: object[] }} payload
 * @param {string} language
 */
export function withoutAttachment(payload, language) {
  if (!payload.attachment) {
    return payload;
  }
  const { attachment: _attachment, ...rest } = payload;
  const note = pick(IMAGE_DROPPED, language);
  const line = payload.format === 'markdown' ? `_${note}_` : note;
  return { ...rest, body: payload.body === '📷' ? line : `${payload.body}\n\n${line}` };
}

/**
 * The Apprise notification of the "Send an Apprise notification" scene action.
 * @param {Record<string, unknown>} fields the resolved scene action fields
 * @param {{ notification_type: string, markdown: boolean }} config
 * @returns {{ body: string, title?: string, type: string, format: string }}
 */
export function fromSceneAction(fields, config) {
  const body = asText(fields?.message);
  if (body === '') {
    throw new InvalidMessageError('message: the text of the notification is empty');
  }
  // "default" (the first option of the select) or empty: the configured type.
  const typed = asText(fields?.type);
  const type = parseType(typed);
  if (typed !== '' && typed !== 'default' && type === null) {
    throw new InvalidMessageError('type: info, success, warning or failure');
  }
  const title = asText(fields?.title);
  return {
    body,
    ...(title ? { title: truncate(title, MAX_TITLE_LENGTH) } : {}),
    type: type ?? config.notification_type,
    format: config.markdown ? 'markdown' : 'text',
  };
}
