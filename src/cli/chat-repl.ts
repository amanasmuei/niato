import * as readline from "node:readline";
import { randomUUID } from "node:crypto";
import { type Nawaitu } from "../core/compose.js";
import { type Companion } from "./companion-config.js";

// Multi-turn chat loop. Persistent session across turns so cost ledger
// and metrics roll up correctly; each turn is otherwise independent —
// turn N can't see turn N-1's content. True conversation memory is
// Level 3 work (long-term memory store + history compaction).
//
// Exits on Ctrl-D / Ctrl-C. Prints cost / latency / dispatch summary
// after every response so the user has the same observability as the
// TUI without any UI dependency.
export function runChatRepl(
  nawaitu: Nawaitu,
  companion: Companion,
): Promise<void> {
  const sessionId = randomUUID();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  console.log(
    `${companion.name} · session ${sessionId.slice(0, 8)} · ctrl-D to exit\n`,
  );
  rl.prompt();

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      rl.prompt();
      return;
    }
    rl.pause();
    void (async () => {
      try {
        const turn = await nawaitu.run(trimmed, sessionId);
        process.stdout.write(`\n${turn.result}\n`);
        const dispatched =
          turn.trace.plan.length > 0
            ? turn.trace.plan.join(", ")
            : "no dispatch";
        process.stdout.write(
          `  ($${turn.trace.costUsd.toFixed(4)} · ${(turn.trace.latencyMs / 1000).toFixed(1)}s · ${dispatched})\n\n`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`\nError: ${msg}\n\n`);
      }
      rl.resume();
      rl.prompt();
    })();
  });

  return new Promise<void>((resolve) => {
    rl.on("close", () => {
      process.stdout.write("\nbye.\n");
      resolve();
    });
  });
}
