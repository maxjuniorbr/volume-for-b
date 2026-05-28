---
description: "Publicar nova versão da extensão volume-for-b na Chrome Web Store. Use quando quiser fazer release, publicar, ou fazer deploy da extensão."
argument-hint: "Descrição das mudanças (ex: 'corrige bug de volume', 'melhora performance')"
agent: "agent"
---

# Publicar volume-for-b na Chrome Web Store

Mudanças desta versão: $input

## 1. Verificar estado atual

Confirme que os testes passam e não há nada pendente:

```bash
npx vitest run
git status
```

## 2. Bumpar versão

Abra [manifest.json](../manifest.json) e incremente `version` seguindo semver:
- **patch** (x.x.N): bug fix ou melhoria interna
- **minor** (x.N.0): nova funcionalidade
- **major** (N.0.0): mudança incompatível

## 3. Build

```bash
node build-production.js
```

Confirme que `volume-for-b-production.zip` foi gerado sem erros.

## 4. Upload para a Chrome Web Store

```bash
export PATH="$PATH:/home/maxjuniorbr/google-cloud-sdk/bin"
TOKEN=$(gcloud auth application-default print-access-token)

curl -s -X PUT \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/hpgpcipagldgjpdngfmmnfojieaiebpj" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Type: application/zip" \
  --data-binary @volume-for-b-production.zip | python3 -m json.tool
```

Resposta esperada: `"uploadState": "SUCCESS"`

Se receber erro de token expirado, rode novamente `gcloud auth application-default login` com os escopos `chromewebstore` e `cloud-platform`.

## 5. Publicar

```bash
TOKEN=$(gcloud auth application-default print-access-token)

curl -s -X POST \
  "https://www.googleapis.com/chromewebstore/v1.1/items/hpgpcipagldgjpdngfmmnfojieaiebpj/publish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" | python3 -m json.tool
```

Resposta esperada: `"status": ["OK"]`

## 6. Commitar e fazer push

```bash
git add manifest.json
git commit -m "chore: bump version to X.Y.Z"
git push
```
