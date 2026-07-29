// Shared constants used by the service worker, popup and offscreen document.
// Single source of truth for limits, defaults and error codes.
//
// Loaded via:
//   - sw.js:           importScripts('constants.js')
//   - popup.html:      <script src="constants.js"></script>  (before popup.js)
//   - offscreen.html:  <script src="constants.js"></script>  (before offscreen.js)
//
// Plain script (no ES module syntax) so it works with importScripts() in MV3
// service workers and as a sibling <script> tag in extension pages.

// Volume / gain
const VOLUME_MIN = 0;
const VOLUME_MAX = 600;
const VOLUME_DEFAULT = 100;
const VOLUME_STEP = 5;

// Domain memory cleanup
const DOMAIN_MAX_AGE_DAYS = 30;
const DOMAIN_KEY_PREFIX = 'domain_';
const CLEANUP_ALARM_NAME = 'vfb-domain-cleanup';
const CLEANUP_PERIOD_MINUTES = 60 * 24; // once a day

// Popup messaging
const POPUP_PORT_NAME = 'popup';
const SEND_MESSAGE_RETRIES = 3;
const SEND_MESSAGE_BASE_DELAY_MS = 500;

// UI feedback
const ERROR_TOAST_MS = 5000;

// String safety
const TAB_TITLE_MAX = 300;
const FAVICON_URL_MAX = 2048;

// Internal error codes returned by the service worker. The popup maps these to
// localized strings so user-facing text never leaks from background to UI.
const ErrorCodes = Object.freeze({
  TAB_NOT_AUDIBLE: 'tab_not_audible',
  TAB_NOT_CONTROLLED: 'tab_not_controlled',
  INVALID_DOMAIN: 'invalid_domain',
  NO_PROCESSOR: 'no_processor',
  ALREADY_PROCESSING: 'already_processing',
  CAPTURE_FAILED: 'capture_failed',
  INTERNAL: 'internal_error'
});

// Clamp a numeric input to [VOLUME_MIN, VOLUME_MAX], falling back to
// VOLUME_DEFAULT when the value cannot be parsed.
function clampVolume(input) {
  const parsed = Number.parseInt(input, 10);
  const safe = Number.isNaN(parsed) ? VOLUME_DEFAULT : parsed;
  return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, safe));
}

// Next value for the −5% / +5% buttons. Snaps to the VOLUME_STEP grid so that
// stepping away from a value dragged on the slider (103%, say) lands on a round
// number — 100% going down, 105% going up — instead of carrying the offset along.
// `direction` is -1 or 1.
function steppedVolume(current, direction) {
  const value = clampVolume(current);
  const grid = direction < 0
    ? Math.ceil(value / VOLUME_STEP)
    : Math.floor(value / VOLUME_STEP);
  return clampVolume((grid + Math.sign(direction)) * VOLUME_STEP);
}

// Resolve a stored/received gain, falling back to VOLUME_DEFAULT only when the
// value is genuinely absent. `gain || VOLUME_DEFAULT` was wrong: VOLUME_MIN is
// 0 and the slider allows it, so a deliberately muted domain came back at 100%.
function resolveGain(value) {
  return Number.isFinite(value) ? clampVolume(value) : VOLUME_DEFAULT;
}
