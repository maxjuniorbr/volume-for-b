# Changelog

All notable changes to `Volume for B` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `−5` and `+5` buttons beside the volume reading, for adjusting in 5% steps
  without dragging the slider. They snap to the nearest multiple of 5, so
  stepping down from 103% lands on 100% rather than 98%, and they disable
  themselves at 0% and 600% instead of offering a click that does nothing.
  The slider keeps its 1% granularity for fine adjustment.

### Fixed
- Volume and mute adjustments were lost roughly 30 seconds after being made.
  The service worker only kept them in memory, so when Chrome recycled it the
  gain read back from storage was the stale one and was pushed to the audio
  graph, silently undoing the change.
- A failed audio capture was reported as success. The offscreen document signals
  failure in the reply body rather than by rejecting, and that reply was being
  discarded — the tab ended up muted, marked as controlled, and producing no
  sound at all.
- Stopping volume control left the tab muted and stuck whenever the offscreen
  document was gone. Restoring the tab's sound no longer depends on that reply.
- A gain of `0` saved for a domain came back as `100%`, because the fallback
  treated zero as "no value stored".
- A tab could stay muted with nothing playing through it after a failed restore.
  Mute is now asserted only while a live audio processor exists for the tab.
- Navigating a controlled tab to another site kept saving the gain under the
  previous domain. The service worker now follows the navigation, and the popup
  no longer reads the domain out of the DOM.
- Opening the popup at the same moment a tab changed its audio state could show
  a controlled tab as uncontrolled, because two concurrent messages raced the
  state restore.
- Volume control stopped working until a browser restart if the offscreen audio
  document died, since its absence was never re-checked.

### Changed
- Confirmation toasts are gone. Starting, stopping and muting no longer pop a
  message: the buttons already change to reflect the new state, so the toast
  only added noise and shifted the layout. Errors are still shown, since a
  failure is not something the button state can convey.
- The offscreen audio document now closes once no tab is being processed,
  instead of keeping an audio context open for the rest of the session.

## [1.1.5] - 2026-05-28

### Fixed
- Service worker wakeup could reset the popup to 100% when returning to a
  controlled tab that was momentarily silent (`audible: false`). The restore
  logic now only discards tabs that no longer exist (`chrome.tabs.get`
  rejects), instead of filtering by `audible`. Storage is only rewritten when
  truly pruning non-existent tabs, preventing volatile in-memory snapshots
  from overwriting persisted state.
- `handleGetControlledTabs` no longer deletes controllers on transient
  `chrome.tabs.get` errors; permanent cleanup is delegated to
  `chrome.tabs.onRemoved`.

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
