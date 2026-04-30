import { type DomainPack } from "../../packs/DomainPack.js";

export interface PackRegistry {
  generic: DomainPack;
  support: DomainPack;
  dev_tools: DomainPack;
}

// TUI-only pack policy: ship Generic by default; Support and Dev Tools
// opt-in via NIATO_PACKS. Reason: Support's MCP is a stub — a stranger
// asking for a refund should not get pretend data. The library's
// createNiato({ packs }) entry-point is untouched; embedders pass
// packs explicitly as before.
export function resolvePacks(
  registry: PackRegistry,
  env: NodeJS.ProcessEnv,
): DomainPack[] {
  const requested = parsePackList(env["NIATO_PACKS"]);
  const result: DomainPack[] = [registry.generic];
  for (const name of requested) {
    if (name === "generic") continue;
    const pack = lookup(registry, name);
    if (pack !== null && !result.includes(pack)) {
      result.push(pack);
    }
  }
  return result;
}

function parsePackList(value: string | undefined): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function lookup(registry: PackRegistry, name: string): DomainPack | null {
  if (name === "generic") return registry.generic;
  if (name === "support") return registry.support;
  if (name === "dev_tools") return registry.dev_tools;
  return null;
}
