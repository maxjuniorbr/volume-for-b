# volume-for-b — Project Instructions

## Overview

Chrome Extension (Manifest V3) that controls volume per individual tab.

- **Extension ID**: `hpgpcipagldgjpdngfmmnfojieaiebpj`
- **Store URL**: https://chromewebstore.google.com/detail/volume-for-b/hpgpcipagldgjpdngfmmnfojieaiebpj
- **Runtime**: Node.js v22.22.0 via nvm (`~/.nvm/versions/node/v22.22.0/`)
- **gcloud CLI**: `~/google-cloud-sdk/bin/` — authenticated as `maxjuniorbr@gmail.com`
- **GCP Project**: `volume-for-b`

## Essential Commands

```bash
# Tests
npx vitest run

# Lint
npx eslint .

# Production build (generates volume-for-b-production.zip)
node build-production.js
```

## Architecture

| File | Purpose |
|------|---------|
| `sw.js` | Main background service worker |
| `popup.js/html/css` | Popup UI |
| `offscreen.js/html` | Offscreen document for Web Audio API |
| `manifest.json` | MV3 manifest |
| `build-production.js` | Build script (uses archiver v8 — `import { ZipArchive }`) |
| `eslint.config.js` | ESLint v10 flat config |

## Git Conventions

- **Conventional Commits**: `feat:`, `fix:`, `perf:`, `chore:`, `docs:`, `style:`, `test:`
- **No commit body** — subject line only
- Main branch: `main`

## Security

- `build.config.js` and `client_secret*.json` are gitignored — never commit
- ADC credentials live at `~/.config/gcloud/application_default_credentials.json`
- No API keys or tokens hardcoded in source code

## Publish Pipeline

See the `/publish` prompt for the full workflow. Summary:
1. Bump `version` in `manifest.json`
2. `node build-production.js`
3. Get OAuth token via `gcloud auth application-default print-access-token`
4. Upload via Chrome Web Store API (PUT)
5. Publish via Chrome Web Store API (POST)
