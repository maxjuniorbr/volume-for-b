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

The service worker is killed and restarted freely by Chrome. Controller state must
survive that. When restoring, only discard a tab if `chrome.tabs.get` rejects —
never filter by `audible`, since a controlled tab can be momentarily silent.
Permanent cleanup belongs to `chrome.tabs.onRemoved`, not to transient errors.

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

**Code** — ES modules throughout, ESLint v10 flat config. Tests are vitest, colocated
in `tests/`. No build step for extension source: `build-production.js` copies plain
files, so nothing from `node_modules` ever ships to users. Every npm dependency is a
devDependency.

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
