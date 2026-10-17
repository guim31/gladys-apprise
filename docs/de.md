# Apprise

Sende die Nachrichten von Gladys an Discord, Telegram, Matrix, Slack, ntfy,
Pushover, E-Mail, SMS und über 100 weitere Dienste, über deine eigene
[Apprise-API](https://github.com/caronc/apprise-api): die Nachrichten deiner
Szenen, die Antworten von Gladys und ihre Systemnachrichten, dazu
Benachrichtigungen mit Titel und Typ aus deinen Szenen. Gladys spricht im
lokalen Netzwerk mit der Apprise-API; Apprise erreicht dann jeden Dienst.

> Getestet mit einer echten Apprise-API 2.0.1 (Image `caronc/apprise`), mit
> gespeicherten Konfigurationen, Tags und Anhängen, aber nicht in einer echten
> Gladys-Installation. Wenn etwas nicht wie beschrieben funktioniert, sag es
> bitte im [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-apprise/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Eine **Apprise-API**, die Gladys in deinem Netzwerk erreicht, zum Beispiel
  das Docker-Image `caronc/apprise` (Port 8000).
- Die zu benachrichtigenden Dienste als **Apprise-URLs**:
  `tgram://bottoken/chatid` für Telegram, `discord://webhook_id/webhook_token`,
  `mailto://benutzer:passwort@gmail.com`, `ntfy://thema`… Die Liste der Dienste
  und ihre URL-Syntax findest du auf
  [appriseit.com](https://appriseit.com/services/).

Zwei Wege, Gladys das Ziel zu nennen:

1. **Eine gespeicherte Konfiguration (empfohlen)**: Lege auf der Webseite der
   Apprise-API eine Konfiguration unter einem Schlüssel an (zum Beispiel
   `apprise`) und gib jeder URL ein oder mehrere **Tags**: `alice`, `bob`,
   `familie`, `ops`… Gladys kennt dann nur den Schlüssel und die Tags, nie
   deine Passwörter.
2. **In Gladys eingefügte Apprise-URLs**: werden mit jeder Benachrichtigung
   gesendet. Einfacher, aber die URLs (mit ihren Passwörtern) werden maskiert
   in Gladys gespeichert.

## Einrichtung

Installiere die Integration über **Integrationen → Von GitHub installieren**
mit der Adresse `https://github.com/guim31/gladys-apprise` und fülle dann ihren
Konfigurationsbildschirm aus:

- **Adresse der Apprise-API**: die Adresse, unter der du die Apprise-API
  öffnest, mit Port, zum Beispiel `http://192.168.1.10:8000`. Eine API unter
  einem Pfad hinter einem Reverse-Proxy (`https://example.org/apprise`)
  funktioniert auch.
- **Schlüssel der gespeicherten Konfiguration**: standardmäßig `apprise`.
- **Gemeinsame Tags**: die Dienste, die die Szenenaktion und der Test
  erreichen. `familie, ops` erreicht die Dienste mit `familie` **oder** `ops`;
  `familie ops` (ein Leerzeichen) die mit `familie` **und** `ops`; `all` alle
  Dienste. Leer: nur die Dienste ohne Tag.
- **Gemeinsame Apprise-URLs (statt einer Konfiguration)**: optional. Wenn
  angegeben, senden die Szenenaktion und der Test an diese URLs und ignorieren
  Schlüssel und Tags.
- **Standard-Benachrichtigungstyp**: Information, Erfolg, Warnung oder Fehler.
  Apprise gibt ihn an die Dienste weiter, die ihn kennen (Farbe, Symbol).
- **Nachrichten als Markdown formatieren**: standardmäßig aktiv. Gladys
  schreibt Fettdruck, Listen und Links in Markdown; Apprise wandelt sie für
  jeden Dienst um.
- **Hinter einem Reverse-Proxy (optional)**: Die Apprise-API hat keine eigene
  Anmeldung. Wenn du sie mit einem Reverse-Proxy schützt, gib **Benutzer** und
  **Passwort** seiner Basic-Authentifizierung an, oder einen **zusätzlichen
  Header** wie `X-Api-Key: …`.
- **Selbstsigniertes Zertifikat akzeptieren**: nur für eine `https://`-Adresse,
  deren Zertifikat du selbst erstellt hast.
- **Sprache der Texte der Integration**: standardmäßig Französisch.

Danach öffnet jede Person, die die Nachrichten von Gladys erhalten will,
**Mein Konto** (auf der Seite der Integration) und füllt aus:

- **Deine Tags**: die eigenen Tags in der gespeicherten Konfiguration, zum
  Beispiel `alice`;
- oder **Deine Apprise-URLs (statt Tags)**: die eigenen Dienste, maskiert.

Beides leer heißt „schick mir nichts“.

Nutze zum Schluss **Testbenachrichtigung senden** (oder die Schaltfläche des
Widgets): Damit prüfst du die API, siehst die Zahl der Dienste und die Tags der
Konfiguration und sendest eine Testbenachrichtigung an das gemeinsame Ziel.

## Was Gladys sendet

- **Nachrichten an eine Person**: eine Szene „Nachricht senden“, die
  Antworten von Gladys, ihre Systemnachrichten. Diese gehen an die Tags oder
  URLs unter **Mein Konto** dieser Person, mit dem Standardtyp, als Markdown.
- **Kamerabilder** (Szenenaktion „Kamerabild senden“): als Anhang an die
  Dienste, die einen annehmen (Telegram, Discord, E-Mail…). Lehnt die
  Apprise-API Anhänge ab (`APPRISE_ATTACH_SIZE=0`), geht der Text allein mit
  einem Hinweis darauf.
- **Szenen-Benachrichtigungen**: die unten beschriebene Aktion.

## Dashboard

Das Widget **Apprise** zeigt, ob die API antwortet, wie viele
Benachrichtigungen heute gesendet wurden und wie viele fehlgeschlagen sind (mit
dem Grund des letzten Fehlers), die letzten Benachrichtigungen der Szenen mit
ihrem Typ und eine Schaltfläche **Test senden**. Die Nachrichten, die Gladys an
eine Person sendet, werden gezählt, aber nie angezeigt: Das Dashboard teilt
sich der ganze Haushalt.

## Szenen

### Auslöser

- **Apprise-API offline**: Die API antwortet nicht mehr (zwei Prüfungen im
  Abstand von 30 Sekunden). Variable: der Fehler.
- **Apprise-API wieder online**: Die API antwortet wieder, nachdem sie offline
  war.
- **Apprise-Benachrichtigung nicht gesendet**: Eine Nachricht konnte nicht
  gesendet werden. Filter: der Grund (Apprise nicht erreichbar, Konfiguration
  prüfen, ein Dienst ist gescheitert, Benachrichtigung abgelehnt) und der
  Absender (eine Gladys-Nachricht, die Apprise-Szenenaktion). Höchstens einmal
  pro Grund alle 15 Minuten: Eine Szene, die darauf mit einer weiteren
  Benachrichtigung antwortet, gerät nicht in eine Schleife. Variablen: Grund,
  Absender, Fehler.

### Aktionen

**Apprise-Benachrichtigung senden**:

- **Titel**: optional.
- **Nachricht**: Pflichtfeld; Szenenvariablen funktionieren.
- **Typ**: Standard der Integration, Information, Erfolg, Warnung oder Fehler.
- **Tags**: optional; ersetzt die gemeinsamen Tags für diese Benachrichtigung
  (nur gespeicherte Konfiguration), zum Beispiel `ops`.

Ausgaben: **Benachrichtigung gesendet** (ja / nein) und **Fehler**, um die
Szene anders fortzusetzen, wenn nichts gesendet wurde.

### Szenenideen

- Die Waschmaschine ist fertig: „Apprise-Benachrichtigung senden“ an
  `familie`, Typ Erfolg.
- Ein Wasserleck: Typ Fehler, Tags `familie, ops`, damit sowohl der
  Familienchat als auch die E-Mail der diensthabenden Person erreicht werden.
- **Apprise-Benachrichtigung nicht gesendet** → eine Lampe rot schalten oder
  die Nachricht über eine andere Integration senden.

## Fehlerbehebung

- **„keine Apprise-API unter dieser Adresse“**: Die Adresse führt nicht zur
  Apprise-API (falscher Port oder fehlender Pfad hinter dem Reverse-Proxy).
- **„keine Konfiguration unter diesem Schlüssel in Apprise gespeichert“**:
  Prüfe den Schlüssel auf der Webseite der Apprise-API.
- **„kein Dienst der Konfiguration hat diese Tags“**: Die Tags unter
  **Mein Konto** oder die gemeinsamen Tags passen zu keiner URL. Ohne Tag
  werden nur die URLs ohne Tag erreicht; `all` erreicht alle Dienste.
- **„ein Dienst hat sie nicht erhalten“**: Apprise hat die API des Dienstes
  erreicht, die abgelehnt hat oder gescheitert ist (falsches Token,
  abgelaufener Webhook…). Die Protokolle der Apprise-API nennen den Dienst.
  Wenn mehrere Dienste benachrichtigt werden, haben die anderen sie erhalten.
- **„Zugriff verweigert“**: Der Reverse-Proxy hat Benutzer, Passwort oder
  Header abgelehnt.
- **Ausführliche Protokolle**: Setze die Umgebungsvariable `LOG_LEVEL=debug`.
  Die Protokolle zeigen nie eine Apprise-URL, ein Passwort oder einen
  Header-Wert.

## Einschränkungen

- Nur Senden: Apprise bringt keine Nachricht zu Gladys zurück.
- Gladys wartet 5 Sekunden auf das Senden einer Nachricht. Antwortet die
  Apprise-API nicht innerhalb von 4 Sekunden, nachdem sie die ganze Anfrage
  erhalten hat, gilt die Nachricht als gesendet: Apprise stellt sie weiter zu,
  das Ergebnis ist nicht bekannt.
- Die Zustellung ist so zuverlässig wie jeder Dienst: Apprise meldet einen
  Fehler, versucht es aber später nicht erneut.
- Der Typ ist ein Hinweis: Dienste ohne Farbe oder Symbol ignorieren ihn.
- Die Testbenachrichtigung geht nur an das gemeinsame Ziel, nicht an
  **Mein Konto** jeder Person.
- Nicht mit Apprise oder seinem Autor verbunden.
