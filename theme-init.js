// Runs before the popup stylesheet is parsed so the first paint already
// matches the resolved theme — no light/dark flash.
//
// Source of truth ordering:
//   1. localStorage cache ("darkMode" = "true" | "false")
//   2. prefers-color-scheme media query (system preference)
//   3. Fallback: dark (project default)
//
// `chrome.storage.local` is the canonical store but it is async, so popup.js
// keeps the localStorage cache in sync after load and after user toggles.
//
// Also stamps `html.preload` so popup.css can suppress transitions until the
// first frame, preventing the post-paint cross-fade.
(function initTheme() {
  const html = document.documentElement;
  html.classList.add('preload');

  let pref = null;
  try {
    pref = globalThis.localStorage?.getItem('darkMode') ?? null;
  } catch (storageError) {
    // localStorage can throw in private/locked-down contexts. Fall back to
    // system preference; logging here is harmless if console is missing.
    if (globalThis.console) {
      globalThis.console.debug('theme-init: localStorage unavailable', storageError);
    }
  }

  let isDark;
  if (pref === 'true') {
    isDark = true;
  } else if (pref === 'false') {
    isDark = false;
  } else if (globalThis.matchMedia) {
    isDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  } else {
    isDark = true;
  }

  if (isDark) {
    html.classList.add('dark-mode');
  }
})();
