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
  try {
    const html = document.documentElement;
    html.classList.add('preload');

    let pref = null;
    try {
      pref = localStorage.getItem('darkMode');
    } catch (_storageBlocked) {
      pref = null;
    }

    let isDark;
    if (pref === 'true') {
      isDark = true;
    } else if (pref === 'false') {
      isDark = false;
    } else if (window.matchMedia) {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      isDark = true;
    }

    if (isDark) {
      html.classList.add('dark-mode');
    }
  } catch (_err) {
    // Best-effort only — leave default light theme on hard failure.
  }
})();
