# Changelog

All notable changes to `Volume for B` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.4] - 2025

### Fixed
- Theme flash on popup open: a synchronous `theme-init.js` runs in the
  document `<head>` before the stylesheet is parsed and applies the resolved
  theme using a `localStorage` cache plus `prefers-color-scheme`. The
  `html.preload` class suppresses transitions on the first frame.
- Hardcoded `lang="pt-BR"` in `popup.html` replaced with `lang="en"`;
  `applyI18n()` still overrides it from `chrome.i18n.getUILanguage()`.

### Changed
- Dark theme selector switched from `body.dark-mode` to `.dark-mode` so the
  class can live on `<html>` for early paint.
- `chrome.storage.local` remains the canonical source for the dark-mode
  preference; `localStorage` is mirrored as a fast synchronous cache.

## [1.1.3] - 2025

### Added
- Centralized shared constants and helpers in `constants.js`
- Structured error codes returned by the service worker. The popup translates
  them to localized, user-facing strings.
- Localized error messages in `_locales/en` and `_locales/pt_BR`
  (`errTabNotAudible`, `errTabNotControlled`, `errInvalidDomain`,
  `errNoProcessor`, `errCaptureFailed`, `errInternal`).
- Daily cleanup of unused per-domain preferences via `chrome.alarms`.
- `chrome.runtime.onSuspend` handler restores tabs to their original
  mute state when the extension is disabled or the browser shuts down.
- `npm run verify` runs lint + tests in one step.

### Changed
- Popup UI redesigned to align with the landing page: Space Grotesk,
  lime accent, dark-first with system-preference aware first run.
- Service worker tightened: input validation, hostname regex, sender
  identity check, lazy state restoration when the worker wakes from idle.
- Popup uses DOM construction (no `innerHTML`) for the tabs list.
- Popup ↔ service worker uses a long-lived `chrome.runtime.connect` Port
  to detect open/close instead of the unreliable `beforeunload`.
- Manifest CSP no longer relies on `'unsafe-inline'` for styles.
- `default_locale` set to `en` for global Chrome Web Store coverage.

### Removed
- `tab.url` is no longer included in `getAudibleTabs` responses
  (data minimization).
- Inline `style="..."` attributes in `popup.html`.
- Noisy `console.log` calls in success paths.

Earlier history is tracked in the Git commit log.
