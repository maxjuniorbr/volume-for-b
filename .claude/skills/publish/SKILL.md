---
name: publish
description: Publish a new version of the volume-for-b extension to the Chrome Web Store. Use when releasing, publishing or deploying the extension.
argument-hint: "[description of what changed in this version]"
disable-model-invocation: true
---

Publish volume-for-b to the Chrome Web Store. Changes in this version: $ARGUMENTS

Work through the steps in order. Stop and report if any check fails.

## 1. Preflight

```bash
npm run verify
npm run audit
git status --short
gh run list --workflow=ci.yml --limit 1
```

Tests and lint must pass, the working tree must be clean, and CI must be green on
the current commit. Confirm the branch is `main` and synced with `origin/main`.

Also check the SonarCloud Quality Gate — it evaluates new code and can be in ERROR
while CI is green, since the two are independent checks. If the SonarQube MCP server
is connected, `get_project_quality_gate_status` with the project key from
`.sonarlint/connectedMode.json` answers this directly.

## 2. Check the docs are current

Never publish with stale documentation. Run these and fix anything they report:

```bash
# README documents exactly the scripts that exist
python3 -c "
import json, re
reais = set(json.load(open('package.json'))['scripts'])
doc = set(re.findall(r'npm run ([a-z:]+)', open('README.md').read()))
print('no README mas não existem:', doc - reais or 'ok')
print('existem mas não documentados:', reais - doc - {'test'} or 'ok')
"

# manifest.json and package.json agree on the version
python3 -c "
import json
m = json.load(open('manifest.json'))['version']
p = json.load(open('package.json'))['version']
print('manifest', m, '| package', p, '->', 'ok' if m == p else 'DIVERGENTES')
"

# relative links in every markdown file resolve
python3 -c "
import re, os, glob
for f in glob.glob('*.md') + glob.glob('.claude/skills/*/SKILL.md'):
    for alvo in re.findall(r'\]\((?!https?:)([^)#]+)', open(f).read()):
        if not os.path.exists(os.path.join(os.path.dirname(f), alvo)):
            print(f, '-> link quebrado:', alvo)
print('links verificados')
"
```

Then read the `[Unreleased]` section of `CHANGELOG.md` and confirm that anything
user-facing in it is also reflected where users actually look:

- a new or changed feature → `README.md` (Core Features) and
  `STORE_DESCRIPTION.pt-BR.md`
- a new MV3 constraint or convention learned while fixing something → `CLAUDE.md`
- a change to the release process itself → this skill

## 3. Bump the version

The version lives in **two** files and they must match — `manifest.json` is what
ships, `package.json` is what the tooling reports. They have drifted before.

```bash
npm version <patch|minor|major> --no-git-tag-version
```

Then set the identical value in `manifest.json`. Choose the bump by semver: patch for
a bug fix or internal change, minor for a new feature, major for a breaking change.

Add a matching section to `CHANGELOG.md` under the release version, following the
Keep a Changelog format already in the file. Only user-visible changes belong there.

## 4. Build

```bash
npm run build
```

Confirm `volume-for-b-production.zip` is generated and the reported version matches
the bump. The build reads the Extension ID from `build.config.js`, which is
gitignored.

## 5. Authenticate

Get a token:

```bash
export PATH="$PATH:$HOME/google-cloud-sdk/bin"
TOKEN=$(gcloud auth application-default print-access-token)
```

If that fails with `invalid_grant`, the refresh token expired and you must
re-authenticate. **This command has two non-obvious requirements** — the plain
`gcloud auth application-default login` does not work:

```bash
gcloud auth application-default login \
  --client-id-file=<path to the volume-for-b OAuth desktop client JSON> \
  --scopes=https://www.googleapis.com/auth/chromewebstore,https://www.googleapis.com/auth/cloud-platform
```

- `--client-id-file` is mandatory. Without it gcloud falls back to its built-in
  client, which Google blocks for the `chromewebstore` scope — the browser shows
  "This app is blocked". The client belongs to the `volume-for-b` GCP project and can
  be downloaded from the Cloud Console credentials page.
- `cloud-platform` must be in the scope list even though only `chromewebstore` is
  used; gcloud refuses to write ADC without it.

The login is interactive. Ask the user to run it rather than running it yourself.

If refresh tokens keep expiring after ~7 days, the OAuth consent screen is still in
"Testing" mode. Switching it to "In production" fixes that permanently.

## 6. Upload

```bash
EXT_ID=$(grep -oP "EXTENSION_ID:\s*'\K[^']+" build.config.js)

curl -s -X PUT \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/$EXT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Type: application/zip" \
  --data-binary @volume-for-b-production.zip | python3 -m json.tool
```

Expect `"uploadState": "SUCCESS"`. Anything else — stop and report the response.

## 7. Publish

Confirm with the user before this step. It makes the version public and cannot be
undone; a mistake requires shipping another version.

```bash
curl -s -X POST \
  "https://www.googleapis.com/chromewebstore/v1.1/items/$EXT_ID/publish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" | python3 -m json.tool
```

Expect `"status": ["OK"]`. A `PUBLISHED_WITH_FRICTION_WARNING` also means success but
flags a listing issue worth reading.

## 8. Record the release

```bash
git add manifest.json package.json package-lock.json CHANGELOG.md
git commit -m "chore: release X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

Commit message is subject-only, as everywhere in this repo. Verify CI goes green
afterwards.

## Verifying without publishing

To read the item's current state at any time — safe, changes nothing:

```bash
curl -s "https://www.googleapis.com/chromewebstore/v1.1/items/$EXT_ID?projection=DRAFT" \
  -H "Authorization: Bearer $TOKEN" -H "x-goog-api-version: 2" | python3 -m json.tool
```

`crxVersion` is the version currently live in the store.
