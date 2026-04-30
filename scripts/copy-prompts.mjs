#!/usr/bin/env node
// Post-build step: copy *.md prompt files from src/ to dist/ preserving
// the directory structure. tsc only emits .js/.d.ts; the runtime loaders
// in src/core/classifier/prompt.ts and src/core/orchestrator/prompt.ts
// readFileSync the adjacent .md, which would 404 without this copy.
import { mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

const files = walk("src");
for (const file of files) {
  const dest = join("dist", relative("src", file));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
}
process.stdout.write(`copied ${files.length} prompt files to dist/\n`);
