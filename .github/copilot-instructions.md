# volume-for-b — Instruções do Projeto

## Visão Geral

Extensão Chrome (Manifest V3) que controla o volume de abas individualmente.

- **Extension ID**: `hpgpcipagldgjpdngfmmnfojieaiebpj`
- **URL da loja**: https://chromewebstore.google.com/detail/volume-for-b/hpgpcipagldgjpdngfmmnfojieaiebpj
- **Runtime**: Node.js v22.22.0 via nvm (`~/.nvm/versions/node/v22.22.0/`)
- **gcloud CLI**: `~/google-cloud-sdk/bin/` — autenticado como `maxjuniorbr@gmail.com`
- **GCP Project**: `volume-for-b`

## Comandos Essenciais

```bash
# Testes
npx vitest run

# Lint
npx eslint .

# Build de produção (gera volume-for-b-production.zip)
node build-production.js
```

## Arquitetura

| Arquivo | Função |
|---------|--------|
| `sw.js` | Service Worker principal (background) |
| `popup.js/html/css` | Interface do popup |
| `offscreen.js/html` | Documento offscreen para Web Audio API |
| `manifest.json` | Manifesto MV3 |
| `build-production.js` | Script de build (usa archiver v8 — `import { ZipArchive }`) |
| `eslint.config.js` | ESLint v10 flat config |

## Convenções Git

- **Conventional Commits**: `feat:`, `fix:`, `perf:`, `chore:`, `docs:`, `style:`, `test:`
- **Sem corpo** no commit — apenas subject line
- Branch principal: `main`

## Segurança

- `build.config.js` e `client_secret*.json` são gitignored — nunca commitar
- Credenciais ADC ficam em `~/.config/gcloud/application_default_credentials.json`
- Nenhuma API key ou token hardcoded no código-fonte

## Pipeline de Publicação

Ver prompt `/publish` para o fluxo completo. Resumo:
1. Bumpar `version` em `manifest.json`
2. `node build-production.js`
3. Obter token OAuth via `gcloud auth application-default print-access-token`
4. Upload via Chrome Web Store API (PUT)
5. Publish via Chrome Web Store API (POST)
