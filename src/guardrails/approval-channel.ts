export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
}

export interface ApprovalDecision {
  decision: "allow" | "deny";
  // Optional human/hook explanation surfaced back to the SDK as
  // `PermissionResult.message` on deny, and recorded in
  // approval_resolved events for audit.
  reason: string | undefined;
}

export type ApprovalListener = (req: ApprovalRequest) => void;

export interface ApprovalChannel {
  // Called from canUseTool. Awaits a matching resolve() or signal abort.
  // Caller MUST guarantee `approvalId` is unique per in-flight request
  // (the SDK's tool_use_id satisfies this); duplicates throw immediately
  // rather than silently abandoning the prior pending entry.
  request(req: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision>;
  // Called from UI when the user pressed approve/deny. No-op for unknown ids.
  resolve(approvalId: string, decision: ApprovalDecision): void;
  // UI subscribes to render incoming requests. Returns an unsubscribe fn.
  // The new listener is synchronously replayed for every currently-
  // pending request so a late mount (e.g. UI subscribing after the
  // SDK has already issued a canUseTool call) doesn't miss in-flight
  // approvals.
  subscribe(listener: ApprovalListener): () => void;
}

interface PendingEntry {
  req: ApprovalRequest;
  resolve(decision: ApprovalDecision): void;
  reject(err: Error): void;
}

export function createApprovalChannel(): ApprovalChannel {
  const pending = new Map<string, PendingEntry>();
  const listeners = new Set<ApprovalListener>();

  // Fan a new request out to all current listeners. Listener exceptions
  // must NEVER break the loop or leave `pending` populated with an
  // orphan entry — the request promise must still settle on resolve()
  // or signal abort. Swallowing here is deliberate; subscribers are
  // responsible for their own error reporting.
  function notifyListeners(req: ApprovalRequest): void {
    for (const listener of listeners) {
      try {
        listener(req);
      } catch {
        // Intentionally swallowed — see comment above.
      }
    }
  }

  return {
    request(req, signal): Promise<ApprovalDecision> {
      return new Promise<ApprovalDecision>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("ApprovalChannel: aborted before request issued"));
          return;
        }
        if (pending.has(req.approvalId)) {
          reject(
            new Error(
              `ApprovalChannel: duplicate approvalId "${req.approvalId}"; caller must guarantee uniqueness`,
            ),
          );
          return;
        }

        // The abort listener is removed on the success path so it does
        // not retain the closure (and the resolved promise's reject
        // callback) until the AbortSignal is GC'd. Per-instance signal
        // listener — a long-lived signal won't accumulate entries.
        const onAbort = (): void => {
          pending.delete(req.approvalId);
          reject(new Error("ApprovalChannel: aborted"));
        };

        pending.set(req.approvalId, {
          req,
          resolve: (decision) => {
            signal.removeEventListener("abort", onAbort);
            resolve(decision);
          },
          reject: (err) => {
            signal.removeEventListener("abort", onAbort);
            reject(err);
          },
        });

        signal.addEventListener("abort", onAbort, { once: true });
        notifyListeners(req);
      });
    },
    resolve(approvalId, decision): void {
      const p = pending.get(approvalId);
      if (p === undefined) return;
      pending.delete(approvalId);
      p.resolve(decision);
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      // Replay current pending so a late subscriber (UI mounting after
      // the orchestrator already called canUseTool) sees in-flight
      // approvals. Wrapped through notifyListeners' try/catch indirectly
      // via direct call here — keep behavior consistent.
      for (const entry of pending.values()) {
        try {
          listener(entry.req);
        } catch {
          // Same swallow rationale as notifyListeners.
        }
      }
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}
