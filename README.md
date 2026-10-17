# Apprise for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that sends the messages of Gladys and notifications from scenes through your
own [Apprise API](https://github.com/caronc/apprise-api), to Discord,
Telegram, Matrix, Slack, ntfy, Pushover, e-mail, SMS and more than 100 other
services.

It is a **send-only communication** integration (manifest `type:
"communication"`, `messaging.receive: false`): no device, nothing comes back
to Gladys. It talks to the Apprise API on your local network
(`transports: ["local"]`); Apprise then reaches each service.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

- **Gladys notification channel**: every message Gladys sends to a person (the
  "Send a message" scene action, the answers of Gladys, its system messages)
  goes to that person's tags in a stored Apprise configuration, or to their own
  Apprise URLs ("My account"). Markdown is converted by Apprise for each
  service; camera images travel as attachments.
- **Scene action** "Send an Apprise notification": title, message, type (info,
  success, warning, failure) and optional tags, to the shared destination.
  Outputs: sent or not, and the error.
- **Triggers**: Apprise API offline, back online, and "notification not sent"
  (filtered by reason and sender, at most once per reason every 15 minutes).
- **Widget**: API status, notifications sent and failed today, the last scene
  notifications, a "Send a test" button.
- **Test action**: checks the API, lists how many services and which tags the
  stored configuration holds (never their URLs), sends a test notification.
- Optional reverse proxy authentication (basic or a custom header), self-signed
  certificates, four languages (en, fr, de, es).

## Requirements

- Gladys Assistant **5.1.0** or later.
- An Apprise API reachable from Gladys, e.g. the `caronc/apprise` Docker image
  (tested with apprise-api 2.0.1).

## Installation

In Gladys: **Integrations → Install from GitHub**, address
`https://github.com/guim31/gladys-apprise`. Then fill in the Configuration
screen (address of the API, key of the stored configuration, shared tags) and
let each person fill in their tags in **My account**. Details in
[docs/en.md](docs/en.md).

## How it works

- `POST /notify/{key}` with `tag` for a stored configuration, `POST /notify/`
  with `urls` for Apprise URLs given in Gladys. Body: `body`, `title`, `type`,
  `format: "markdown"`, `attachment` (base64).
- `GET /status` every 5 minutes (re-checked after 30 s): online / offline, and
  whether the server refuses attachments (`attach_lock`).
- `GET /json/urls/{key}?privacy=1` for the test report only (Apprise masks the
  passwords); only the number of services and their tags are kept.
- State under `/data/apprise-state.json`: server state, today's counters, last
  scene notifications. No URL, no password, no address.

## Checked on a real server, and what was not

Checked on a real `caronc/apprise:latest` (apprise-api 2.0.1) in Docker, with
`json://` services pointing at a local HTTP receiver that recorded what
arrived: stateless and stored configurations, OR / AND tags, no matching tag
(424), unknown key (404), a failing service (424), attachments accepted and
refused (`APPRISE_ATTACH_SIZE=0`), basic authentication through a reverse
proxy, and the integration itself in the locked-down container of the Gladys
sandbox, against the fake Gladys of the SDK. Real answers are in
`test/fixtures/apprise/`.

Not checked: a real Gladys installation, and real third-party services
(Telegram, Discord…): Apprise delivers to them, the integration only talks to
the Apprise API.

## Limitations

- Send only.
- Gladys waits 5 s for a message: an Apprise API that has received the whole
  request but answers after 4 s is counted as having sent it.
- Apprise reports a failed service but does not retry.
- The test notification goes to the shared destination only.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

Tests run against the fake Gladys of the SDK and an in-memory Apprise API
(`test/helpers/fakeApprise.js`) answering with the captured real answers. They
never touch the network.

## Credits

- [Apprise](https://github.com/caronc/apprise) (BSD-2-Clause) and
  [Apprise API](https://github.com/caronc/apprise-api) (MIT) by Chris Caron: the
  API, its tag syntax and its documentation.
- The Home Assistant [`apprise`](https://www.home-assistant.io/integrations/apprise/)
  integration (Apache-2.0): the choice of URLs or a configuration plus tags as
  targets. No code was copied.
- The architecture, transport, store and tests come from
  [gladys-gotify](https://github.com/guim31/gladys-gotify); the shape of a
  send-only channel from [ntfy for Gladys](https://github.com/callemand/gladys-ntfy)
  by callemand.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Apprise
project or its author.

## License

Apache-2.0
