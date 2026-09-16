import { getRawDb } from "./index";
import { beginApprovedSubmission, claimApprovedExecution, finishSubmission, type ExecutionClaimInput } from "./action-execution-claims";

export type ExecutionAttemptStatus =
  | "claimed"
  | "submitting"
  | "succeeded"
  | "failed"
  | "unknown";

export type ActionExecutionAttemptRow = {
  id: string;
  workspace_id: string;
  mission_id: string;
  action_id: string;
  provider: string;
  idempotency_key: string;
  payload_hash: string;
  status: ExecutionAttemptStatus;
  attempt_count: number;
  provider_request_id: string | null;
  receipt_json: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type ExecutionAttemptSummary = Omit<
  ActionExecutionAttemptRow,
  "workspace_id" | "receipt_json"
> & { receipt: Record<string, unknown> | null };

export async function claimExecutionAttempt(input: ExecutionClaimInput): Promise<{ attempt: ActionExecutionAttemptRow; created: boolean }> {
  return claimApprovedExecution(getRawDb(), input);
}

export async function getExecutionAttemptByKey(
  workspaceId: string,
  idempotencyKey: string,
): Promise<ActionExecutionAttemptRow | null> {
  return getRawDb()
    .prepare("SELECT * FROM action_execution_attempts WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1")
    .bind(workspaceId, idempotencyKey)
    .first<ActionExecutionAttemptRow>();
}

export async function getLatestExecutionAttempt(
  workspaceId: string,
  actionId: string,
): Promise<ActionExecutionAttemptRow | null> {
  return getRawDb()
    .prepare("SELECT * FROM action_execution_attempts WHERE workspace_id = ? AND action_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(workspaceId, actionId)
    .first<ActionExecutionAttemptRow>();
}

export async function markAttemptSubmitting(
  workspaceId: string,
  attemptId: string,
  expectedStatuses: ExecutionAttemptStatus[],
  settingsUpdatedAt: number,
): Promise<string | null> {
  return beginApprovedSubmission(getRawDb(), workspaceId, attemptId, expectedStatuses, Date.now(), settingsUpdatedAt);
}

export async function finishExecutionAttempt(input: {
  workspaceId: string;
  attemptId: string;
  submissionToken: string;
  status: "succeeded" | "failed" | "unknown";
  providerRequestId?: string | null;
  receipt?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<ActionExecutionAttemptRow> {
  return finishSubmission(getRawDb(), input);
}

export function summarizeExecutionAttempt(
  row: ActionExecutionAttemptRow | null,
): ExecutionAttemptSummary | null {
  if (!row) return null;
  let receipt: Record<string, unknown> | null = null;
  try {
    const parsed = row.receipt_json ? JSON.parse(row.receipt_json) : null;
    receipt = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    receipt = null;
  }
  const { workspace_id: _workspaceId, receipt_json: _receiptJson, ...safe } = row;
  void _workspaceId;
  void _receiptJson;
  return { ...safe, receipt };
}
