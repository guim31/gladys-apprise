# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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
