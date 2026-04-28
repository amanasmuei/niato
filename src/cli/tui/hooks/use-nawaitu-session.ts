import { useCallback, useState } from "react";
import { type Nawaitu, type NawaituTurn } from "../../../core/compose.js";
import { type IntentResult } from "../../../core/classifier/types.js";
import { type TurnRecord } from "../../../observability/trace.js";
import { type Logger } from "../../../observability/log.js";

export type SessionPhase =
  | "idle"
  | "classifying"
  | "dispatching"
  | "done"
  | "error";

// `| undefined` (not `?:`) on optional fields: the project's TS config
// has `exactOptionalPropertyTypes: true`, so `?:` would forbid storing
// the literal `undefined` we get from `useState<X | undefined>(...)`.
export interface TurnState {
  input: string;
  output: string | undefined;
  classification: IntentResult | undefined;
  trace: TurnRecord | undefined;
  errorMessage: string | undefined;
  phase: SessionPhase;
}

export interface UseNawaitu {
  phase: SessionPhase;
  classification: IntentResult | undefined;
  trace: TurnRecord | undefined;
  turns: TurnState[];
  run: (input: string) => Promise<void>;
}

// Owns the per-session Nawaitu lifecycle for the TUI: builds a single
// Nawaitu instance via `factory` (passed a logger that drives in-flight
// `phase` transitions: idle → classifying → dispatching → done|error)
// and exposes a `run()` that records each turn into `turns`.
//
// Why a factory rather than passing a Nawaitu directly: the Nawaitu needs
// the logger that this hook owns (so we can subscribe to the SDK's own
// "turn start" / "classification" structured logs), and the logger lives
// inside the hook. Constructing outside would either force the caller to
// share a logger (awkward) or skip the structured-log subscription.
export function useNawaituSession(
  factory: (logger: Logger) => Nawaitu,
  sessionId: string,
  onTurnComplete?: (turn: TurnState) => void,
): UseNawaitu {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [classification, setClassification] = useState<
    IntentResult | undefined
  >(undefined);
  const [trace, setTrace] = useState<TurnRecord | undefined>(undefined);
  const [turns, setTurns] = useState<TurnState[]>([]);

  // Lazy one-shot construction via useState's initializer — React's
  // documented idiom for "expensive once-per-mount" objects. This is
  // strict-mode safe (the initializer fires once even under
  // double-invocation) and avoids the eslint-irritating useRef + null-
  // check + non-null-assertion combo.
  const [nawaitu] = useState<Nawaitu>(() => {
    const logger: Logger = {
      log(_level, message, fields): void {
        if (message === "turn start") {
          setPhase("classifying");
          return;
        }
        if (message === "classification") {
          const c: unknown = fields?.["classification"];
          // Narrow `unknown` shape before treating as IntentResult. The
          // `as IntentResult` cast below is the single concession to the
          // logger's `Record<string, unknown>` field bag — guarded by
          // the runtime check on `intent`.
          if (
            typeof c === "object" &&
            c !== null &&
            typeof (c as { intent?: unknown }).intent === "string"
          ) {
            // Cast: shape-narrowed by the runtime check above; logger's
            // `fields` are unavoidably `unknown` at the boundary.
            setClassification(c as IntentResult);
            setPhase("dispatching");
          }
        }
      },
    };
    return factory(logger);
  });

  const run = useCallback(
    async (input: string): Promise<void> => {
      setPhase("classifying");
      setTurns((t) => [
        ...t,
        {
          input,
          output: undefined,
          classification: undefined,
          trace: undefined,
          errorMessage: undefined,
          phase: "classifying",
        },
      ]);
      try {
        const turnResult: NawaituTurn = await nawaitu.run(input, sessionId);
        const next: TurnState = {
          input,
          output: turnResult.result,
          classification: turnResult.classification,
          trace: turnResult.trace,
          errorMessage: undefined,
          phase: "done",
        };
        setPhase("done");
        setTrace(turnResult.trace);
        setTurns((t) => [...t.slice(0, -1), next]);
        onTurnComplete?.(next);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setPhase("error");
        setTurns((t) => {
          // Invariant: the optimistic push above guarantees length >= 1
          // before the catch block runs. Runtime-check anyway because
          // project ESLint forbids non-null assertions.
          const last = t[t.length - 1];
          if (last === undefined) {
            // Defensive: should be unreachable given the optimistic push.
            return [
              ...t,
              {
                input,
                output: undefined,
                classification: undefined,
                trace: undefined,
                errorMessage: msg,
                phase: "error",
              },
            ];
          }
          return [
            ...t.slice(0, -1),
            { ...last, phase: "error", errorMessage: msg },
          ];
        });
      }
    },
    [nawaitu, sessionId, onTurnComplete],
  );

  return { phase, classification, trace, turns, run };
}
