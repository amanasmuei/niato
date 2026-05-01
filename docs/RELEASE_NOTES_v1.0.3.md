# Niato v1.0.3 — OAuth path actually works

## Two bugs fixed, one masked the other

Before v1.0.3, the OAuth subscription path silently broke for fresh installs. Two issues were entangled:

### 1. Sessions directory never auto-created

`createNiato()` passed `cwd: ~/.niato/sdk-sessions` to the orchestrator's SDK call. On a fresh machine that directory doesn't exist. The Agent SDK spawns its child process at that cwd, can't, and the SDK's exit handler reports a misleading:

```
ReferenceError: Claude Code native binary not found at .../claude
```

The binary was always there. The cwd wasn't. Fix: `createNiato()` now does `mkdirSync(NIATO_SDK_SESSIONS_DIR, { recursive: true })` at startup. Idempotent.

### 2. Classifier `maxTurns: 1` insufficient for OAuth + json_schema

The classifier in `src/core/classifier/sonnet.ts` sets the SDK's `maxTurns: 1`. On the API-key path, the SDK finalizes the structured `json_schema` output in one turn. On the OAuth path it doesn't — the SDK's loop needs at least one more turn to land the structured output, and exits with:

```
Reached maximum number of turns (1)
```

Fix: bumped to `maxTurns: 2`. Harmless on the API-key path because the model still exits early when the result is ready; the cap only kicks in when the OAuth path needs it.

## Why CI never caught this

Every E2E test suite (smoke, eval, cross-pack) auto-skips when `ANTHROPIC_API_KEY` is absent. CI doesn't carry the secret. So the OAuth path has never had end-to-end coverage in CI — only the API-key path was exercised locally before publish. Both bugs were waiting to be hit by anyone using subscription auth.

## Auth setup, for the record

The Agent SDK reads `CLAUDE_CODE_OAUTH_TOKEN`, not `ANTHROPIC_API_KEY`, on the OAuth path. The right setup:

```bash
# 1. Generate the token (Pro/Max/Team/Enterprise subscription required)
claude setup-token

# 2. In your env (or .env)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
NIATO_AUTH=subscription
# unset ANTHROPIC_API_KEY  — it takes precedence over OAuth if set
```

Personal-use only per Anthropic's terms of service. Anything you distribute, sell, or let other users authenticate into must use a developer API key from console.anthropic.com.

## No behavior change for API-key users

If you've been running niato with `ANTHROPIC_API_KEY=sk-ant-api03-...`, nothing changes. Same code paths, same outputs.
