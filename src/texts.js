// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, the "Send a test" report, the errors of the scene action,
// the line replacing a dropped image. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';
import { ERROR_KINDS } from './apprise/client.js';

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Applies `render` to each language of a table of functions. */
export const each = (table, render) =>
  Object.fromEntries(Object.entries(table).map(([lang, value]) => [lang, render(value, lang)]));

// Appended to a Gladys message whose camera image could not follow.
export const IMAGE_DROPPED = {
  en: 'Image not sent: this Apprise server refuses attachments.',
  fr: 'Image non transmise : ce serveur Apprise refuse les pièces jointes.',
  de: 'Bild nicht gesendet: Dieser Apprise-Server lehnt Anhänge ab.',
  es: 'Imagen no enviada: este servidor Apprise rechaza los archivos adjuntos.',
};

// One short explanation per error kind (src/apprise/client.js), plus the
// invalid scene action fields.
export const ERROR_TEXT = {
  [ERROR_KINDS.NO_SERVER]: {
    en: 'enter the address of your Apprise API in the configuration',
    fr: "saisissez l'adresse de votre API Apprise dans la configuration",
    de: 'gib die Adresse deiner Apprise-API in der Konfiguration ein',
    es: 'introduzca la dirección de su API Apprise en la configuración',
  },
  [ERROR_KINDS.INVALID_URL]: {
    en: 'address not understood, e.g. http://192.168.1.10:8000',
    fr: 'adresse incomprise, ex. http://192.168.1.10:8000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.10:8000',
    es: 'dirección no válida, p. ej. http://192.168.1.10:8000',
  },
  [ERROR_KINDS.INVALID_KEY]: {
    en: 'the configuration key holds letters, digits, - and _ only',
    fr: 'la clé de configuration ne contient que lettres, chiffres, - et _',
    de: 'der Konfigurationsschlüssel enthält nur Buchstaben, Ziffern, - und _',
    es: 'la clave de configuración solo admite letras, cifras, - y _',
  },
  [ERROR_KINDS.NO_TARGET]: {
    en: 'no destination: enter a configuration key or Apprise URLs',
    fr: 'aucune destination : saisissez une clé de configuration ou des URL Apprise',
    de: 'kein Ziel: Gib einen Konfigurationsschlüssel oder Apprise-URLs ein',
    es: 'ningún destino: indique una clave de configuración o URL de Apprise',
  },
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'the Apprise API does not answer',
    fr: "l'API Apprise ne répond pas",
    de: 'die Apprise-API antwortet nicht',
    es: 'la API Apprise no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept a self-signed certificate"',
    fr: 'certificat refusé : cochez « Accepter un certificat auto-signé »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsigniertes Zertifikat akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar un certificado autofirmado»',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the final address (https://, path)',
    fr: "l'adresse redirige : saisissez l'adresse finale (https://, chemin)",
    de: 'die Adresse leitet um: Gib die endgültige Adresse ein (https://, Pfad)',
    es: 'la dirección redirige: introduzca la dirección final (https://, ruta)',
  },
  [ERROR_KINDS.NOT_APPRISE]: {
    en: 'no Apprise API at this address',
    fr: 'aucune API Apprise à cette adresse',
    de: 'keine Apprise-API unter dieser Adresse',
    es: 'no hay ninguna API Apprise en esta dirección',
  },
  [ERROR_KINDS.UNAUTHORIZED]: {
    en: 'access refused: check the user, password or header of the proxy',
    fr: "accès refusé : vérifiez l'utilisateur, le mot de passe ou l'en-tête du proxy",
    de: 'Zugriff verweigert: Prüfe Benutzer, Passwort oder Header des Proxys',
    es: 'acceso denegado: compruebe el usuario, la contraseña o la cabecera del proxy',
  },
  [ERROR_KINDS.NO_CONFIG]: {
    en: 'no configuration stored under this key in Apprise',
    fr: 'aucune configuration enregistrée sous cette clé dans Apprise',
    de: 'keine Konfiguration unter diesem Schlüssel in Apprise gespeichert',
    es: 'no hay ninguna configuración guardada con esta clave en Apprise',
  },
  [ERROR_KINDS.NO_MATCH]: {
    en: 'no service of the configuration has these tags',
    fr: "aucun service de la configuration n'a ces tags",
    de: 'kein Dienst der Konfiguration hat diese Tags',
    es: 'ningún servicio de la configuración tiene estas etiquetas',
  },
  [ERROR_KINDS.INVALID_URLS]: {
    en: 'Apprise understood none of the URLs',
    fr: "Apprise n'a compris aucune des URL",
    de: 'Apprise hat keine der URLs verstanden',
    es: 'Apprise no ha entendido ninguna de las URL',
  },
  [ERROR_KINDS.BAD_ATTACHMENT]: {
    en: 'Apprise refused the attached image',
    fr: "Apprise a refusé l'image jointe",
    de: 'Apprise hat das angehängte Bild abgelehnt',
    es: 'Apprise ha rechazado la imagen adjunta',
  },
  [ERROR_KINDS.SERVICE_FAILED]: {
    en: 'a service did not receive it, see the Apprise logs',
    fr: "un service ne l'a pas reçue, voir les logs d'Apprise",
    de: 'ein Dienst hat sie nicht erhalten, sieh in den Apprise-Protokollen nach',
    es: 'un servicio no la ha recibido, consulte los registros de Apprise',
  },
  [ERROR_KINDS.REJECTED]: {
    en: 'Apprise refused the notification, see the logs',
    fr: 'Apprise a refusé la notification, voir les logs',
    de: 'Apprise hat die Benachrichtigung abgelehnt, sieh in den Protokollen nach',
    es: 'Apprise ha rechazado la notificación, consulte los registros',
  },
  [ERROR_KINDS.SERVER_ERROR]: {
    en: 'Apprise answered with an error, see its logs',
    fr: 'Apprise a répondu par une erreur, voir ses logs',
    de: 'Apprise hat mit einem Fehler geantwortet, sieh in seinen Protokollen nach',
    es: 'Apprise ha respondido con un error, consulte sus registros',
  },
  invalid: {
    en: 'invalid notification, see the scene logs',
    fr: 'notification invalide, voir les logs de la scène',
    de: 'ungültige Benachrichtigung, sieh in den Protokollen der Szene nach',
    es: 'notificación no válida, consulte los registros de la escena',
  },
  unknown: {
    en: 'unexpected error, see the logs',
    fr: 'erreur inattendue, voir les logs',
    de: 'unerwarteter Fehler, sieh in den Protokollen nach',
    es: 'error inesperado, consulte los registros',
  },
};

/** The error text of any error, in one language. */
export function errorText(err, language) {
  const kind = err?.name === 'InvalidMessageError' ? 'invalid' : err?.kind;
  return pick(ERROR_TEXT[kind] ?? ERROR_TEXT.unknown, language);
}

/** The same, as a multi-language object (connection status, action reports). */
export function errorTexts(err) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, errorText(err, lang)]));
}

// The "Send a test" report and the test notification itself.
export const REPORT_TEXT = {
  en: {
    reachable: 'Apprise answers.',
    urls: (count) => `${count} Apprise URL(s) given.`,
    config: (key, count, tags) =>
      `Configuration "${key}": ${count} service(s)${tags ? `, tags ${tags}` : ', no tag'}.`,
    sent: 'Test notification sent.',
    accepted: 'Test notification accepted, its delivery not confirmed in time.',
    failed: (reason) => `Test notification not sent: ${reason}.`,
    unreachable: (reason) => `Apprise cannot be reached: ${reason}.`,
    title: 'Gladys test',
    message: 'Gladys can send you notifications through Apprise.',
  },
  fr: {
    reachable: 'Apprise répond.',
    urls: (count) => `${count} URL Apprise renseignée(s).`,
    config: (key, count, tags) =>
      `Configuration « ${key} » : ${count} service(s)${tags ? `, tags ${tags}` : ', sans tag'}.`,
    sent: 'Notification de test envoyée.',
    accepted: 'Notification de test acceptée, sans confirmation de livraison à temps.',
    failed: (reason) => `Notification de test non envoyée : ${reason}.`,
    unreachable: (reason) => `Apprise est injoignable : ${reason}.`,
    title: 'Test de Gladys',
    message: 'Gladys peut vous envoyer des notifications par Apprise.',
  },
  de: {
    reachable: 'Apprise antwortet.',
    urls: (count) => `${count} Apprise-URL(s) angegeben.`,
    config: (key, count, tags) =>
      `Konfiguration „${key}“: ${count} Dienst(e)${tags ? `, Tags ${tags}` : ', ohne Tag'}.`,
    sent: 'Testbenachrichtigung gesendet.',
    accepted: 'Testbenachrichtigung angenommen, Zustellung nicht rechtzeitig bestätigt.',
    failed: (reason) => `Testbenachrichtigung nicht gesendet: ${reason}.`,
    unreachable: (reason) => `Apprise ist nicht erreichbar: ${reason}.`,
    title: 'Gladys-Test',
    message: 'Gladys kann dir Benachrichtigungen über Apprise senden.',
  },
  es: {
    reachable: 'Apprise responde.',
    urls: (count) => `${count} URL de Apprise indicada(s).`,
    config: (key, count, tags) =>
      `Configuración «${key}»: ${count} servicio(s)${tags ? `, etiquetas ${tags}` : ', sin etiqueta'}.`,
    sent: 'Notificación de prueba enviada.',
    accepted: 'Notificación de prueba aceptada, entrega no confirmada a tiempo.',
    failed: (reason) => `Notificación de prueba no enviada: ${reason}.`,
    unreachable: (reason) => `No se puede contactar con Apprise: ${reason}.`,
    title: 'Prueba de Gladys',
    message: 'Gladys puede enviarle notificaciones a través de Apprise.',
  },
};
