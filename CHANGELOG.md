# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-22

### Security

- Rebuilt on Node.js 24.22.1, the October 2026 security release (remote code
  execution in the Brotli decoder, CVE-2026-111497; TLS hostname and DNS
  fixes).

## [1.0.0] - 2026-10-17

### Added

- Apprise as a Gladys notification channel: every message Gladys sends to a
  person (the "Send a message" scene action, the answers of Gladys, its system
  messages) goes out through your Apprise API to Discord, Telegram, Matrix,
  e-mail, SMS and 100+ other services, formatted as Markdown.
- "My account" for each Gladys user: their tags in a stored Apprise
  configuration, or their own Apprise URLs (masked).
- Camera images sent as attachments; a line replaces them when the Apprise API
  refuses attachments.
- Scene action "Send an Apprise notification": title, message, type and tags,
  with "sent" and "error" outputs.
- Scene triggers: Apprise API offline, Apprise API back online, Apprise
  notification not sent (filtered by reason and sender).
- Dashboard widget "Apprise": API status, notifications of the day, last scene
  notifications, a test button.
- Action "Send a test notification", which also lists the services and tags of
  the stored configuration (never their URLs).
- Optional reverse proxy authentication (basic or a custom header) and
  self-signed certificates.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-apprise/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-apprise/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/guim31/gladys-apprise/releases/tag/v1.0.0
