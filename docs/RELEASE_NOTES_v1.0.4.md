# Niato v1.0.4 — Eval gate live + classifier robustness

## What's new

**The CI eval gate is now active.** All three packs ship with committed baseline floors:

| Pack | Score |
|------|-------|
| `generic`   | 20/20 |
| `support`   | 23/25 |
| `dev_tools` | 25/25 |

Future PRs run `pnpm eval <pack> --baseline` and fail if the score drops. The README's "Backlog #1" is closed.

## Classifier robustness fixes

While capturing baselines, two SDK edge cases surfaced under the OAuth path:

1. **Action-phrased inputs** (`"Run the test suite and tell me which tests fail"`, `"fix the websocket memory leak"`) caused the classifier's model to reach for tools that weren't there. Each failed tool attempt counted as a turn, exhausting the cap before structured output landed. Fix: `allowedTools: []` in the classifier — the model can't reach for tools it doesn't have.

2. **`maxTurns` ceiling raised to 20** (was 1). API-key path still completes in 1; the cap only kicks in on the OAuth path's longer json_schema flow. This is a ceiling, not a target — the model exits early when ready.

3. **Eval runner now records classifier failures as failed cases** instead of aborting the entire suite. A single flaky case shouldn't invalidate the other 24.

## CI gate, in practice

```bash
# After making any classifier-impacting change:
pnpm eval generic --baseline
pnpm eval support --baseline
pnpm eval dev_tools --baseline
# All three must pass — exits 1 if `passed` count drops below baseline.
```

To intentionally update a baseline (e.g. after an improvement):

```bash
pnpm eval support --write-baseline
```

The baseline files live next to each pack's `cases.jsonl` and are tracked in git.
