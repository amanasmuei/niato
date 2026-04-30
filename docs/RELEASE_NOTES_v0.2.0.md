# Niato v0.2.0 — Release Prep

**The first version anyone can install.** Distribution-ready: MIT license, npm-publishable, OAuth subscription path now opt-in, Node-based bin dispatcher.

## What's new

- **License.** MIT. Niato is free to use, modify, and distribute.
- **`npm i -g niato`** is now the recommended install path. The `pnpm link` flow stays available for local development.
- **Subscription auth is opt-in.** New users hit the developer API path by default; the Claude Max subscription path requires explicit `NIATO_AUTH=subscription`. This closes a default that pushed strangers onto a ToS-uncertain code path. See README "Note on subscription auth" for the framing.
- **Clearer auth errors.** Running without either auth path now exits with code 2 and an actionable fix-it message, not a Node stack trace.
- **Node-based bin dispatcher.** The `niato` binary no longer requires pnpm — it's a Node script that spawns the matching dist entry directly.
- **Build copies prompt files.** Postbuild step copies `*.md` prompts from `src/` to `dist/` so `readFileSync`-based prompt loaders work after npm install.
- **Honest docs.** ARCHITECTURE.md no longer claims "no code yet."

## Breaking changes

- `resolveAuthMode()` from `src/core/config.ts` now throws `NiatoAuthError` when neither `ANTHROPIC_API_KEY` nor `NIATO_AUTH=subscription` is set. Previously it silently returned `"oauth_subscription"`. Users on the subscription path must add `NIATO_AUTH=subscription` to their shell.
- `EnvSchema` now validates `NIATO_AUTH` as `z.literal("subscription").optional()`. Unknown values like `NIATO_AUTH=subsciption` (typo) fail clearly at `loadConfig` time with the schema constraint, instead of silently falling through.
- `bin/niato` is now a Node script (was a pnpm-wrapping shell script). The shell-only `pnpm` dependency is gone; consumers need only Node 20+.

## Migration for personal subscription-auth users

Add to your shell init (or `.env`):

```bash
export NIATO_AUTH=subscription
```

Behavior is otherwise unchanged. The TUI auto-detects persisted subscription auth from prior versions and sets the env var on startup; no manual migration needed if you only use `niato` (the TUI).

## New public API

- `NiatoAuthError` is now exported from `niato` so consumers can `instanceof`-check the auth-misconfiguration error path.

## Verified install path

The v0.2.0 tarball was smoke-tested with:

```bash
npm pack
mkdir scratch && cd scratch && npm init -y
npm install ../niato-0.2.0.tgz
node -e "import('niato').then(m => console.log(typeof m.createNiato))"
node node_modules/niato/bin/niato --version
```

Imports resolve cleanly; `bin/niato` runs without pnpm.

## Up next

`docs/superpowers/plans/2026-04-30-v1-release-roadmap.md` lists the remaining work to v1.0:
- v0.3.0 — In-app onboarding (Ink-native API key entry + companion wizard)
- v0.4.0 — Conversation memory
- v1.0.0 — Polish (error UX, default packs, eval baselines)
