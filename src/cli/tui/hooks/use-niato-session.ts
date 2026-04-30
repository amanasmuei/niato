import { useCallback, useState } from "react";
import { type Niato, type NiatoTurn } from "../../../core/compose.js";
import { type IntentResult } from "../../../core/classifier/types.js";
import { type TurnRecord } from "../../../observability/trace.js";
import { type Logger } from "../../../observability/log.js";
import { classifyError } from "../../error-classify.js";

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

export interface UseNiato {
  phase: SessionPhase;
  classification: IntentResult | undefined;
  trace: TurnRecord | undefined;
  turns: TurnState[];
  run: (input: string) => Promise<void>;
}

// Owns the per-session Niato lifecycle for the TUI: builds a single
// Niato instance via `factory` (passed a logger that drives in-flight
// `phase` transitions: idle → classifying → dispatching → done|error)
// and exposes a `run()` that records each turn into `turns`.
//
// Why a factory rather than passing a Niato directly: the Niato needs
// the logger that this hook owns (so we can subscribe to the SDK's own
// "turn start" / "classification" structured logs), and the logger lives
// inside the hook. Constructing outside would either force the caller to
// share a logger (awkward) or skip the structured-log subscription.
export function useNiatoSession(
  factory: (logger: Logger) => Niato,
  sessionId: string,
  onTurnComplete?: (turn: TurnState) => void,
): UseNiato {
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
  const [niato] = useState<Niato>(() => {
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
        const turnResult: NiatoTurn = await niato.run(input, sessionId);
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
        const classified = classifyError(err);
        const msg =
          classified !== null
            ? classified.message
            : err instanceof Error
              ? err.message
              : String(err);
        const errorTurn: TurnState = {
          input,
          output: undefined,
          classification: undefined,
          trace: undefined,
          errorMessage: msg,
          phase: "error",
        };
        setPhase("error");
        setTurns((t) => [...t.slice(0, -1), errorTurn]);
        onTurnComplete?.(errorTurn);
      }
    },
    [niato, sessionId, onTurnComplete],
  );

  return { phase, classification, trace, turns, run };
}
