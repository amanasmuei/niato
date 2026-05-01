# Niato v1.0.1 — Scoped npm package

## What changed

The npm package is now published as **`@amanasmuei/niato`** instead of `niato`.

```bash
# Before (v1.0.0 — never reached the registry)
npm i -g niato

# After (v1.0.1)
npm i -g @amanasmuei/niato
```

The bin command, the directory layout, the project's spoken name, and every API export are unchanged. Only the npm package identifier is scoped.

## Why

When the v1.0.0 release ran, npm's registry rejected the publish with `403 — package name too similar to existing packages nano, nats`. The build itself was clean (typecheck, lint, test, pack all green; signed Sigstore provenance attested) — the registry simply does not allow the unscoped name.

Three options:

1. **Scope the package** — minimal churn, keeps the brand. ✅ chosen.
2. Pick a different unscoped name — risks the same policy on the next attempt; requires renaming the bin and every doc reference.
3. Appeal to npm support — slow, uncertain.

v1.0.0's git tag is preserved as a record of the failed publish; the package was never claimed on the registry, so v1.0.1 is the first version users can actually install.

## Behavior changes

None. v1.0.1 is byte-equivalent to what v1.0.0 would have shipped, modulo the `name` and `version` fields in `package.json` and a few docs that name the install command.
