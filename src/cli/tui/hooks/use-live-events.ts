import { useCallback, useEffect, useState } from "react";
import {
  type ApprovalChannel,
  type ApprovalRequest,
} from "../../../guardrails/approval-channel.js";
import { type NiatoEvent } from "../../../observability/events.js";

export interface UseLiveEvents {
  events: NiatoEvent[];
  pendingApproval: ApprovalRequest | undefined;
  push(event: NiatoEvent): void;
  reset(): void;
}

// Subscribes to an ApprovalChannel for inline approval prompts and
// exposes a `push()` callback for the parent (useNiatoSession) to feed
// in events from Niato.runStream. State lives here, not in
// useNiatoSession, so the LivePanel can be re-rendered without bouncing
// the entire session lifecycle.
//
// The `approval_requested` synthetic event is pushed automatically when
// a request arrives on the channel — consumers don't need to push it
// themselves. `approval_resolved` is the parent's responsibility (Task 7
// emits it from the keypress handler); when push() receives one, the
// pending approval is cleared.
//
// Channel-reference stability: callers MUST hold the channel reference
// stable across renders (e.g. `useState(() => createApprovalChannel())`).
// A new channel reference re-fires the useEffect, calling unsub() on the
// prior listener and re-subscribing to the new one. Events are NOT
// cleared on channel swap — call `reset()` explicitly for a hard reset.
//
// Single-slot pendingApproval: although ApprovalChannel supports
// concurrent pending entries (its internal Map keys by approvalId), this
// hook surfaces only the most-recent request as pendingApproval. The
// LivePanel renders one prompt at a time. This is safe today because
// the SDK's canUseTool fires serially per orchestrator turn (one
// specialist runs at a time per CLAUDE.md §6); if concurrent specialists
// are ever introduced, change pendingApproval to
// `Map<approvalId, ApprovalRequest>` or an explicit queue.
export function useLiveEvents(channel: ApprovalChannel): UseLiveEvents {
  const [events, setEvents] = useState<NiatoEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<
    ApprovalRequest | undefined
  >(undefined);

  useEffect(() => {
    const unsub = channel.subscribe((req) => {
      setPendingApproval(req);
      setEvents((prev) => [
        ...prev,
        {
          type: "approval_requested",
          approvalId: req.approvalId,
          toolName: req.toolName,
          toolInput: req.toolInput,
          reason: req.reason,
        },
      ]);
    });
    return unsub;
  }, [channel]);

  const push = useCallback((event: NiatoEvent): void => {
    setEvents((prev) => [...prev, event]);
    if (event.type === "approval_resolved") {
      setPendingApproval(undefined);
    }
  }, []);

  const reset = useCallback((): void => {
    setEvents([]);
    setPendingApproval(undefined);
  }, []);

  return { events, pendingApproval, push, reset };
}
