# Niato v0.3.0 — In-App Onboarding

**Install-to-first-turn is now fully self-contained inside the TUI.** After `npm i -g niato && niato`, a stranger walks through Ink-native auth + companion setup without ever needing `pnpm`, the repo, or shell env vars they don't know how to set.

## What's new

- **ApiKeyEntry screen.** When you pick "API key" in first-run and `ANTHROPIC_API_KEY` isn't already in your shell, the TUI prompts for the key in-app, saves it to `~/.niato/auth.json` (chmod 600), and continues. v0.2 used to print "set the env var and re-run `niato`" and exit — that hand-off is gone. Light validation: warns if the key doesn't start with `sk-ant-` (catches OpenAI-key paste mistakes), accepts on second Enter.
- **CompanionWizard screen.** Four-step in-Ink wizard: name → optional address-as → voice archetype → optional description. Persists to `~/.niato/companion.json`. v0.2's `pnpm chat`-then-come-back hand-off is gone.
- **Settings → reset paths in-app.** "Re-run companion wizard" and "Re-run auth setup" now route to the new screens, not console hints to run pnpm scripts.
- **First-run end-to-end test.** The integration suite now exercises the full first-run → api-key entry → companion wizard → launcher path, asserting all four screens render and transitions persist correctly.

## Migration

None needed. Existing `~/.niato/auth.json` and `~/.niato/companion.json` files are read as-is. New users get the in-app flow.

## Breaking changes

None. The `pnpm chat` standalone REPL still exists for legacy/dev use; only the first-run hand-off changed.

## Up next

`docs/superpowers/plans/2026-04-30-v1-release-roadmap.md`:
- Plan 3 (v0.4) — conversation memory across turns
- Plan 4 (v1.0) — error UX polish, default packs, eval baselines
