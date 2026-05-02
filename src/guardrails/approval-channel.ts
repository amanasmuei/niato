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
  request(req: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision>;
  // Called from UI when the user pressed approve/deny. No-op for unknown ids.
  resolve(approvalId: string, decision: ApprovalDecision): void;
  // UI subscribes to render incoming requests. Returns an unsubscribe fn.
  subscribe(listener: ApprovalListener): () => void;
}

interface PendingResolver {
  resolve(decision: ApprovalDecision): void;
  reject(err: Error): void;
}

export function createApprovalChannel(): ApprovalChannel {
  const pending = new Map<string, PendingResolver>();
  const listeners = new Set<ApprovalListener>();

  return {
    request(req, signal): Promise<ApprovalDecision> {
      return new Promise<ApprovalDecision>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("ApprovalChannel: aborted before request issued"));
          return;
        }
        pending.set(req.approvalId, { resolve, reject });
        const onAbort = (): void => {
          pending.delete(req.approvalId);
          reject(new Error("ApprovalChannel: aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        for (const listener of listeners) listener(req);
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
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}
