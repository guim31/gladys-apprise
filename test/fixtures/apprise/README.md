# Apprise API fixtures

Real answers of `caronc/apprise:latest` (apprise-api **2.0.1**, image of 2026-10-03), captured in
Docker on 2026-10-17 with `json://` services pointing at a small local HTTP receiver. Addresses
replaced by documentation ranges (198.51.100.x). Each file is `{ status, body }`.

| File                    | Request                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `status`                | `GET /status` (with `Accept: application/json`)                 |
| `status-attach-locked`  | the same, server started with `APPRISE_ATTACH_SIZE=0`           |
| `notify-sent`           | `POST /notify/{key}` with a tag matching two services           |
| `notify-service-failed` | `POST /notify/` to a service answering HTTP 500                 |
| `notify-no-match`       | `POST /notify/{key}` with a tag matching no service (or no tag) |
| `notify-no-config`      | `POST /notify/{key}` with an unknown key                        |
| `notify-no-valid-url`   | `POST /notify/` with `urls: "garbage"`                          |
| `notify-empty-body`     | `POST /notify/` with `body: ""`                                 |
| `notify-bad-attachment` | an attachment to a server that refuses them                     |
| `json-urls`             | `GET /json/urls/{key}` of a configuration of three services     |
| `sink-json-payload`     | what a `json://` service received (`format: markdown`)          |

Without `Accept: application/json`, `GET /status` answers `OK` in `text/plain`. An unknown key on
`GET /json/urls/{key}` answers 204 with no body.
