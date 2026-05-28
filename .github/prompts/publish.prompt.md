---
description: "Publish a new version of the volume-for-b extension to the Chrome Web Store. Use when you want to release, publish, or deploy the extension."
argument-hint: "Description of changes (e.g. 'fix volume bug', 'improve performance')"
agent: "agent"
---

# Publish volume-for-b to the Chrome Web Store

Changes in this version: $input

## 1. Check current state

Confirm tests pass and there's nothing uncommitted:

```bash
npx vitest run
git status
```

## 2. Bump version

Open [manifest.json](../manifest.json) and increment `version` following semver:
- **patch** (x.x.N): bug fix or internal improvement
- **minor** (x.N.0): new feature
- **major** (N.0.0): breaking change

## 3. Build

```bash
node build-production.js
```

Confirm `volume-for-b-production.zip` was generated without errors.

## 4. Upload to the Chrome Web Store

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

Expected response: `"uploadState": "SUCCESS"`

If you get a token expiry error, re-authenticate with `gcloud auth application-default login` using scopes `chromewebstore` and `cloud-platform`.

## 5. Publish

```bash
TOKEN=$(gcloud auth application-default print-access-token)

curl -s -X POST \
  "https://www.googleapis.com/chromewebstore/v1.1/items/hpgpcipagldgjpdngfmmnfojieaiebpj/publish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" | python3 -m json.tool
```

Expected response: `"status": ["OK"]`

## 6. Commit and push

```bash
git add manifest.json
git commit -m "chore: bump version to X.Y.Z"
git push
```
