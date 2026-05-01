# Niato v1.0.2 — Correct npm scope

## What changed

The npm scope is `@aman_asmuei` (with underscore), not `@amanasmuei`. The package is now:

```bash
npm i -g @aman_asmuei/niato
```

That's the only difference from v1.0.1.

## Why

v1.0.1 corrected the original v1.0.0 unscoped-name rejection by switching to `@amanasmuei/niato` — but that scope did not exist on the npm registry. The actual npm username is `aman_asmuei`, which matches what npm itself suggested in the v1.0.0 error message. v1.0.2 fixes the typo and lands.

## Behavior changes

None. v1.0.2 is byte-equivalent to v1.0.1 except the `name` and `version` fields in `package.json` and the docs that reference the install command.
