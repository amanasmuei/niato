# Releasing Niato

How to ship a new version to npm. The CI publishes; you tag.

---

## One-time setup

### 1. Create the GitHub repo

If the repo isn't on GitHub yet:

```bash
# Create the repo (public) — adjust owner/name to taste
gh repo create <owner>/niato --public --source=. --remote=origin --push

# Or manually:
#   1. Create the empty repo at https://github.com/new
#   2. git remote add origin git@github.com:<owner>/niato.git
#   3. git push -u origin master
#   4. git push origin --tags
```

After pushing, fill in `package.json` `repository` / `homepage` / `bugs` fields:

```json
"repository": { "type": "git", "url": "git+https://github.com/<owner>/niato.git" },
"homepage": "https://github.com/<owner>/niato#readme",
"bugs": { "url": "https://github.com/<owner>/niato/issues" }
```

Commit the change. CI will validate it on the next push.

### 2. Create the npm publish token

The CI publishes on your behalf using a granular access token. To create one:

1. Sign in at <https://www.npmjs.com/>.
2. Open **Account → Access Tokens → Generate New Token → Granular Access Token**.
3. Configure:
   - **Name:** `niato-ci-publish`
   - **Expiration:** your call (90 days is a sane default; rotate before expiry).
   - **Permissions → Packages and scopes:** select `niato` only — *Read and write*.
   - **Bypass 2FA:** **enabled** (required — CI cannot prompt for your TOTP).
4. **Copy the token immediately** — npm shows it once, then never again.

### 3. Add the token to GitHub Secrets

1. In your repo: **Settings → Secrets and variables → Actions → New repository secret**.
2. **Name:** `NPM_TOKEN`. **Value:** the token from step 2.
3. Save.

### 4. (Optional) Add a release-protection environment

The release workflow declares `environment: npm-publish` on its publish job. To require manual approval before any publish runs:

1. **Settings → Environments → New environment** named `npm-publish`.
2. Enable **Required reviewers** and add yourself (and any release co-owners).
3. Save.

After this, every tag push pauses on the `npm-publish` step until a reviewer clicks Approve. Skip this for solo projects where the tag-push intent is itself the approval.

---

## Per-release flow

### 1. Bump the version

Edit `package.json`:

```json
"version": "X.Y.Z"
```

Follow [SemVer](https://semver.org): `MAJOR.MINOR.PATCH`.

### 2. Update the changelog

Add a section to `docs/CHANGELOG.md`:

```markdown
## vX.Y.Z — YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

### 3. Run the local done-bar

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Must pass — CI will run the same gate again.

### 4. Commit, tag, push

```bash
git add package.json docs/CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin master
git push origin vX.Y.Z
```

The tag push triggers `.github/workflows/release.yml`. The workflow:

1. Verifies `package.json` version matches the tag.
2. Runs typecheck + lint + test + build.
3. Publishes `niato@X.Y.Z` to npm with Sigstore provenance.
4. (If `environment: npm-publish` has reviewers configured) waits for manual approval before publishing.

Watch the run at `https://github.com/<owner>/niato/actions/workflows/release.yml`.

### 5. Verify on npm

```bash
npm view @aman_asmuei/niato@X.Y.Z
```

Should show the new version. Public consumers can now `npm i @aman_asmuei/niato@X.Y.Z`.

---

## Retrying a failed publish

If the CI publish fails (lockfile drift, registry transient error, etc.) and you need to retry without re-tagging:

1. Go to **Actions → Release → Run workflow** (workflow_dispatch).
2. Enter the existing tag (e.g. `v1.0.0`) in the input.
3. Click Run.

The workflow re-runs against the same tag.

> Note: npm forbids re-publishing the same version. If the prior publish *did* succeed but CI reported failure (e.g. a step after publish failed), you cannot re-publish; bump to `X.Y.Z+1` instead. `npm view @aman_asmuei/niato@X.Y.Z` confirms whether the version landed on the registry.

---

## Manual publish (fallback, no CI)

If GitHub Actions is unavailable or you need to publish from a fresh laptop:

```bash
npm login                                    # interactive
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test
pnpm build
npm publish --access public --otp=XXXXXX     # 6-digit code from your authenticator
```

`--otp` accepts a TOTP from your 2FA app. CI uses the bypass-2FA token instead because it cannot read your authenticator.

---

## Token rotation

The `NPM_TOKEN` secret expires when its underlying npm token expires (90 days by default). To rotate:

1. Generate a new granular access token (steps above).
2. **Settings → Secrets → NPM_TOKEN → Update** with the new value.
3. Revoke the old token at npm (Account → Access Tokens → Revoke).

CI keeps working with no workflow change.

---

## Pre-release versions

To ship a release-candidate or beta without setting it as `latest`:

```bash
# In package.json:
"version": "1.1.0-rc.1"

git commit ...
git tag v1.1.0-rc.1
git push origin v1.1.0-rc.1
```

Then add to the `Publish to npm` step in `release.yml`:

```yaml
run: npm publish --access public --provenance --tag next
```

Or use `--tag rc` / `--tag beta` per your channel naming. The default `--tag latest` is what the workflow uses today; consumers running `npm i @aman_asmuei/niato` get `latest`.

A more polished setup is a separate workflow file (`release-prerelease.yml`) keyed on tag patterns like `v*-rc.*`. Defer until you actually need pre-releases.
