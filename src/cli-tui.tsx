import { useEffect, useState, type ReactElement } from "react";
import { Box, render, Text, useApp } from "ink";
import { PhaseLine } from "./cli/tui/components/phase-line.js";
import { TokenPanel } from "./cli/tui/components/token-panel.js";
import { createNawaitu } from "./core/compose.js";
import { type DomainPack } from "./packs/DomainPack.js";
import { genericPack } from "./packs/generic/index.js";
import { supportPack } from "./packs/support/index.js";
import { devToolsPack } from "./packs/dev-tools/index.js";
import { type Logger } from "./observability/log.js";
import { type IntentResult } from "./core/classifier/types.js";
import { type TurnRecord } from "./observability/trace.js";

type Phase =
  | "validating"
  | "classifying"
  | "dispatching"
  | "done"
  | "error";

interface TuiState {
  phase: Phase;
  sessionId?: string | undefined;
  turnId?: string | undefined;
  classification?: IntentResult | undefined;
  result?: string | undefined;
  trace?: TurnRecord | undefined;
  errorMessage?: string | undefined;
}

function App({
  packs,
  userInput,
}: {
  packs: DomainPack[];
  userInput: string;
}): ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<TuiState>({ phase: "validating" });

  useEffect(() => {
    // Object wrapper avoids eslint mis-narrowing `let cancelled = false` as
    // always-falsy (the cleanup mutation isn't visible to the analyzer).
    const flag = { cancelled: false };

    // A custom Logger pipes Nawaitu's existing log events into TUI state. The
    // turn-start / classification / turn messages are already emitted by
    // compose.ts — no run() refactor needed.
    const tuiLogger: Logger = {
      log(_level, message, fields) {
        if (flag.cancelled) return;
        if (message === "turn start") {
          setState((s) => ({
            ...s,
            phase: "classifying",
            sessionId: typeof fields?.["sessionId"] === "string"
              ? fields["sessionId"]
              : s.sessionId,
            turnId: typeof fields?.["turnId"] === "string"
              ? fields["turnId"]
              : s.turnId,
          }));
        } else if (message === "classification") {
          const c = fields?.["classification"];
          if (isIntentResult(c)) {
            setState((s) => ({
              ...s,
              phase: "dispatching",
              classification: c,
            }));
          }
        }
      },
    };

    void (async () => {
      try {
        const nawaitu = createNawaitu({ packs, logger: tuiLogger });
        const turn = await nawaitu.run(userInput);
        if (flag.cancelled) return;
        setState((s) => ({
          ...s,
          phase: "done",
          result: turn.result,
          trace: turn.trace,
          classification: turn.classification,
        }));
        // Give the final frame a tick to render before exit().
        setTimeout(() => {
          exit();
        }, 0);
      } catch (err) {
        if (flag.cancelled) return;
        setState((s) => ({
          ...s,
          phase: "error",
          errorMessage:
            err instanceof Error ? err.message : String(err),
        }));
        setTimeout(() => {
          exit(err instanceof Error ? err : new Error(String(err)));
        }, 0);
      }
    })();

    return () => {
      flag.cancelled = true;
    };
  }, [packs, userInput, exit]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Nawaitu
        </Text>
        <Text color="gray"> · single-turn TUI</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">Input</Text>
        <Text>{truncate(userInput, 240)}</Text>
      </Box>

      <PhaseLine
        label="Validate"
        active={state.phase === "validating"}
        done={state.phase !== "validating"}
        failed={state.phase === "error"}
      />
      <PhaseLine
        label="Classify"
        active={state.phase === "classifying"}
        done={
          state.classification !== undefined &&
          state.phase !== "classifying"
        }
        failed={state.phase === "error" && state.classification === undefined}
        detail={
          state.classification !== undefined
            ? formatClassification(state.classification)
            : undefined
        }
      />
      <PhaseLine
        label="Dispatch"
        active={state.phase === "dispatching"}
        done={state.phase === "done"}
        failed={
          state.phase === "error" && state.classification !== undefined
        }
        detail={
          state.trace !== undefined
            ? state.trace.plan.length > 0
              ? state.trace.plan.join(", ")
              : "(no specialist dispatched)"
            : undefined
        }
      />

      {state.phase === "done" && state.result !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">Result</Text>
          <Text>{state.result}</Text>
        </Box>
      )}

      {state.trace !== undefined && (
        <TokenPanel trace={state.trace} />
      )}

      {state.phase === "error" && state.errorMessage !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red" bold>
            Error
          </Text>
          <Text color="red">{state.errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}

function formatClassification(c: IntentResult): string {
  return `${c.domain}/${c.intent} (conf ${(c.confidence * 100).toFixed(0)}%)`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function isIntentResult(value: unknown): value is IntentResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["intent"] === "string" &&
    typeof v["domain"] === "string" &&
    typeof v["confidence"] === "number"
  );
}

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
    else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main(): Promise<void> {
  const userInput =
    process.argv.slice(2).join(" ").trim() || (await readStdinAll());
  if (!userInput) {
    console.error(
      "usage: pnpm dev:tui '<your question>'   |   echo '<input>' | pnpm dev:tui",
    );
    process.exit(2);
  }

  const { waitUntilExit } = render(
    <App
      packs={[genericPack, supportPack, devToolsPack]}
      userInput={userInput}
    />,
  );
  await waitUntilExit();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exit(1);
});
