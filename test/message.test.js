import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InvalidMessageError,
  MAX_TITLE_LENGTH,
  fromGladysMessage,
  fromSceneAction,
  parseAttachment,
  withoutAttachment,
} from '../src/apprise/message.js';

const CONFIG = { notification_type: 'info', markdown: true };

test('a Gladys message is Markdown, without title', () => {
  assert.deepEqual(fromGladysMessage({ text: ' **Hi** ' }, { type: 'info', markdown: true }), {
    body: '**Hi**',
    type: 'info',
    format: 'markdown',
  });
  assert.equal(fromGladysMessage({ text: 'x' }, { type: 'info', markdown: false }).format, 'text');
});

test('a camera image becomes an attachment, or a line when refused', () => {
  const payload = fromGladysMessage(
    { text: 'Door', file: 'data:image/png;base64,iVBO\nRw0=' },
    { type: 'info', markdown: true },
  );
  assert.deepEqual(payload.attachment, [
    { base64: 'iVBORw0=', filename: 'gladys.png', mimetype: 'image/png' },
  ]);
  assert.deepEqual(withoutAttachment(payload, 'en'), {
    body: 'Door\n\n_Image not sent: this Apprise server refuses attachments._',
    type: 'info',
    format: 'markdown',
  });
  const alone = fromGladysMessage(
    { file: 'image/jpg;base64,/9j/' },
    { type: 'info', markdown: false },
  );
  assert.equal(alone.attachment[0].mimetype, 'image/jpeg');
  assert.equal(
    withoutAttachment(alone, 'fr').body,
    'Image non transmise : ce serveur Apprise refuse les pièces jointes.',
  );
  assert.equal(parseAttachment('not an image'), null);
  assert.equal(parseAttachment(42), null);
});

test('an empty message is refused before reaching Apprise', () => {
  assert.throws(() => fromGladysMessage({ text: '  ' }, CONFIG), InvalidMessageError);
  assert.throws(() => fromGladysMessage(null, CONFIG), InvalidMessageError);
});

test('the scene action: title, type, defaults', () => {
  assert.deepEqual(fromSceneAction({ title: 'Door', message: 'Open', type: 'warning' }, CONFIG), {
    body: 'Open',
    title: 'Door',
    type: 'warning',
    format: 'markdown',
  });
  assert.equal(fromSceneAction({ message: 'x', type: 'default' }, CONFIG).type, 'info');
  assert.equal(fromSceneAction({ message: 42 }, CONFIG).body, '42');
  const long = fromSceneAction({ message: 'x', title: 'é'.repeat(300) }, CONFIG).title;
  assert.equal(Array.from(long).length, MAX_TITLE_LENGTH);
});

test('the scene action refuses an empty text and an unknown type', () => {
  assert.throws(() => fromSceneAction({ message: '' }, CONFIG), /message/);
  assert.throws(() => fromSceneAction({ message: 'x', type: 'urgent' }, CONFIG), /type/);
});
