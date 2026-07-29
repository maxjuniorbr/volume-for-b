# volume-for-b

Chrome Extension (Manifest V3) that amplifies audio per individual tab, up to 600%.
Audio processing is entirely local — the extension makes no network requests.

Public listing: https://chromewebstore.google.com/detail/volume-for-b/hpgpcipagldgjpdngfmmnfojieaiebpj

## Commands

```bash
npm run verify   # lint:check + test — run before every commit
npm test         # vitest run
npm run lint     # eslint with --fix
npm run audit    # npm audit --audit-level=high
npm run build    # production build -> volume-for-b-production.zip
```

Node version is pinned in `.nvmrc`. CI runs `verify`, `audit` and `build` on every
push to `main`, plus a scheduled `audit` every Monday.

## Architecture

| File | Purpose |
|------|---------|
| `sw.js` | Service worker — owns controller state per tab, survives wakeups |
| `popup.js` / `.html` / `.css` | Popup UI |
| `theme-init.js` | Synchronous theme resolution in `<head>`, prevents flash-on-open |
| `offscreen.js` / `.html` | Offscreen document hosting the Web Audio API graph |
| `constants.js` | Values shared between service worker, popup and offscreen |
| `manifest.json` | MV3 manifest — the version here is what ships |
| `build-production.js` | Build script; uses archiver v8 (`import { ZipArchive }`) |

Audio flows through the offscreen document because MV3 service workers have no
access to the Web Audio API. The service worker holds the source of truth for
which tabs are controlled and at what gain, persisted to `chrome.storage`.

### Service worker state

The service worker is killed and restarted freely by Chrome — roughly 30s of idle
is enough. Controller state must survive that, so **anything a handler mutates has
to be persisted**, not just held in memory: on wakeup the state read back from
storage is pushed to the audio graph, and a stale value silently overwrites what
the user just set.

When restoring, only discard a tab if `chrome.tabs.get` rejects — never filter by
`audible`, since a controlled tab can be momentarily silent. Permanent cleanup
belongs to `chrome.tabs.onRemoved`, not to transient errors.

Restore is memoized as a promise, not a boolean flag. A flag set before the `await`
lets a second concurrent message through while the restore is still running.

### MV3 constraints that are easy to get wrong

- **`chrome.tabCapture` does not exist in the offscreen document.** The service
  worker calls `getMediaStreamId` and passes the id along; the offscreen document
  only consumes it via `getUserMedia`. Test mocks must not offer this API to the
  offscreen context, or they hide the failure.
- **`runtime.onSuspend` never fires for MV3 service workers** — it only ever
  applied to MV2 event pages. There is no pre-termination hook, so nothing can be
  cleaned up "on the way out". A tab muted while the extension is uninstalled
  stays muted; that case is unrecoverable by design.
- **The offscreen document reports failure in the reply body, not by rejecting.**
  And when no listener answers, `sendMessage` resolves `undefined`. Both must be
  treated as failure — check `result?.success`.
- **Ask `chrome.offscreen.hasDocument()`** instead of tracking an in-memory flag;
  the document can die independently of the service worker. It closes itself once
  no tab is being processed, and is recreated on demand.
- **A tab stays muted only while a live processor exists for it.** Muting is what
  prevents double audio; without processing, muting is silence for nothing.

### Popup UI

Design tokens live in `popup.css` and mirror the landing page for color, spacing
and radii. Typography deliberately diverges: the popup uses system font stacks
because no font binaries ship with the extension.

There are no success toasts. Button labels and states are the feedback — the mute
button flips to Unmute, Start disables, and so on. Errors do get a message, since
no button state can convey a failure.

## Conventions

**Commits** — Conventional Commits, subject line only. No body, no trailers of any
kind, including `Co-Authored-By`. One line and done.

```
fix: preserve controller state when SW wakes up on silent tab
chore(deps): drop unused sharp and upgrade dev dependencies
```

Types in use: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`, `ci`.

**Branch** — commits go straight to `main`. The project does not use pull requests;
that is a deliberate choice so the commit message convention always holds. Dependabot
PR creation is disabled for the same reason, while its alerts stay enabled.

**Explanatory context** belongs in `CHANGELOG.md` (Keep a Changelog format), not in
commit messages — and only for changes visible to users. Tooling changes are not
recorded there.

**Code** — ES modules throughout, ESLint v10 flat config. No build step for extension
source: `build-production.js` copies plain files, so nothing from `node_modules` ever
ships to users. Every npm dependency is a devDependency.

**Comments** — record why, not what. A comment restating the function name below it
is noise and gets removed; a comment explaining an API constraint or the reason a
recovery path exists is load-bearing and stays.

**Tests** — vitest, in `tests/`. `sw.js` and `offscreen.js` are loaded into a
`node:vm` sandbox with a hand-built `chrome` mock (`tests/sw.helpers.js`,
`tests/offscreen.helpers.js`). Keep those mocks honest: a mock that exposes an API
the real context lacks turns a production crash into a passing test.

## Security

- `build.config.js` holds the Extension ID and is gitignored — never commit it, and
  never hardcode the ID into tracked files. Read it from there when needed.
- `client_secret*.json` and ADC credentials are likewise never committed.
- Do not add runtime dependencies. The extension ships no third-party code, which is
  what keeps `npm audit` findings irrelevant to users.
- The manifest requests `tabs`, `tabCapture`, `offscreen`, `storage` and `alarms`.
  Adding a permission requires a Chrome Web Store re-review — justify it first.

## Releasing

Use the `/publish` skill. It covers the version bump, the build, and the Chrome Web
Store upload including the OAuth setup, which has non-obvious requirements.
