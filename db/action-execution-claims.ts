import { ActionDecisionConflict } from "./action-decisions";
import type { ActionExecutionAttemptRow, ExecutionAttemptStatus } from "./action-execution-attempts";
import { executionPeriods } from "./execution-capacity";

export const SUBMISSION_LEASE_MS = 120_000;
export const EXECUTION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export type ExecutionClaimInput = {
  workspaceId: string;
  missionId: string;
  actionId: string;
  provider: string;
  idempotencyKey: string;
  payloadHash: string;
};

/** Claim only while the exact approval still exists at the write boundary. */
export async function claimApprovedExecution(
  db: D1Database,
  input: ExecutionClaimInput,
  now = Date.now(),
): Promise<{ attempt: ActionExecutionAttemptRow; created: boolean }> {
  const result = await db.prepare(`INSERT INTO action_execution_attempts
    (id, workspace_id, mission_id, action_id, provider, idempotency_key, payload_hash,
     status, attempt_count, started_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, 'claimed', 1, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM action_queue WHERE workspace_id = ? AND id = ?
      AND mission_id = ? AND payload_hash = ? AND status = 'approved' AND expires_at > ?)
    ON CONFLICT(idempotency_key) DO NOTHING`)
    .bind(`att_${crypto.randomUUID()}`, input.workspaceId, input.missionId, input.actionId,
      input.provider, input.idempotencyKey, input.payloadHash, now, now, now,
      input.workspaceId, input.actionId, input.missionId, input.payloadHash, now).run();
  const attempt = await db.prepare(
    "SELECT * FROM action_execution_attempts WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
  ).bind(input.workspaceId, input.idempotencyKey).first<ActionExecutionAttemptRow>();
  if (!attempt || attempt.action_id !== input.actionId || attempt.mission_id !== input.missionId ||
      attempt.payload_hash !== input.payloadHash || attempt.provider !== input.provider) {
    throw new ActionDecisionConflict();
  }
  return { attempt, created: Number(result.meta.changes ?? 0) === 1 };
}

/** Reserve workspace capacity and acquire a fenced submission in one transaction. */
export async function beginApprovedSubmission(
  db: D1Database,
  workspaceId: string,
  attemptId: string,
  expectedStatuses: ExecutionAttemptStatus[],
  now = Date.now(),
  settingsUpdatedAt?: number,
): Promise<string | null> {
  const allowed = expectedStatuses.filter((status) => ["claimed", "failed", "unknown", "submitting"].includes(status));
  if (allowed.length === 0) return null;
  const token = crypto.randomUUID();
  const { day, month } = executionPeriods(now);
  // Retries reserve no additional provider cost for the same idempotency key.
  // Each HTTP submission still consumes one rolling-day request allowance.
  const cost = `CASE WHEN EXISTS (SELECT 1 FROM execution_submissions WHERE attempt_id = action_execution_attempts.id)
    THEN 0 ELSE COALESCE(json_extract(action.payload_json, '$.projected_cost_cents'), 0) END`;
  const reserved = (since: number) => `(SELECT COALESCE(SUM(s.projected_cost_cents), 0)
    FROM execution_submissions s JOIN action_execution_attempts a ON a.id = s.attempt_id AND a.workspace_id = s.workspace_id
    WHERE s.workspace_id = action_execution_attempts.workspace_id AND s.started_at >= ${since}
      AND a.status IN ('submitting', 'unknown', 'succeeded'))`;
  const results = await db.batch([
    db.prepare(`UPDATE action_execution_attempts
    SET status = 'submitting', attempt_count = CASE WHEN status = 'claimed' THEN attempt_count ELSE attempt_count + 1 END,
      error_code = NULL, error_message = NULL, completed_at = NULL, updated_at = ?
    WHERE workspace_id = ? AND id = ? AND status IN (${allowed.map(() => "?").join(",")})
      AND (status != 'submitting' OR updated_at <= ?)
      AND created_at >= ?
      AND EXISTS (SELECT 1 FROM action_queue AS action JOIN workspace_settings settings ON settings.workspace_id = action.workspace_id
        WHERE action.workspace_id = action_execution_attempts.workspace_id
          AND action.id = action_execution_attempts.action_id
          AND action.mission_id = action_execution_attempts.mission_id
          AND action.payload_hash = action_execution_attempts.payload_hash
          AND action.status = 'approved' AND action.expires_at > ?
          AND (? IS NULL OR settings.updated_at = ?)
          AND COALESCE(json_extract(action.payload_json, '$.projected_cost_cents'), 0) <= settings.per_action_budget_cents
          AND ${cost} + ${reserved(day)} <= settings.daily_budget_cents
          AND ${cost} + ${reserved(month)} <= settings.monthly_budget_cents
          AND (SELECT COALESCE(SUM(request_count), 0) FROM execution_submissions
            WHERE workspace_id = settings.workspace_id AND started_at > ?) < settings.max_daily_actions)
      RETURNING *`)
      .bind(now, workspaceId, attemptId, ...allowed, now - SUBMISSION_LEASE_MS,
        now - EXECUTION_RETRY_WINDOW_MS, now, settingsUpdatedAt ?? null, settingsUpdatedAt ?? null, now - 86_400_000),
    db.prepare(`INSERT INTO execution_submissions (id, workspace_id, attempt_id, submission_number, projected_cost_cents, started_at)
      SELECT ?, a.workspace_id, a.id, a.attempt_count,
        CASE WHEN EXISTS (SELECT 1 FROM execution_submissions WHERE attempt_id = a.id) THEN 0
          ELSE COALESCE(json_extract(q.payload_json, '$.projected_cost_cents'), 0) END, ?
      FROM action_execution_attempts a JOIN action_queue q ON q.id = a.action_id AND q.workspace_id = a.workspace_id
      WHERE a.workspace_id = ? AND a.id = ? AND changes() = 1`)
      .bind(token, now, workspaceId, attemptId),
    db.prepare(`INSERT INTO audit_events (workspace_id, actor_user_id, event_category, event_type, action_id, resource_type, resource_id, detail_json, created_at)
      SELECT a.workspace_id, 'system:resend-submission', 'action', 'action.submission_started', a.action_id,
        'execution_submission', s.id, '{}', s.started_at FROM execution_submissions s
      JOIN action_execution_attempts a ON a.id = s.attempt_id AND a.workspace_id = s.workspace_id WHERE s.id = ?`)
      .bind(token),
  ]);
  return results[0].results.length ? token : null;
}

export async function finishSubmission(db: D1Database, input: {
  workspaceId: string; attemptId: string; submissionToken: string;
  status: "succeeded" | "failed" | "unknown"; providerRequestId?: string | null;
  receipt?: Record<string, unknown>; errorCode?: string | null; errorMessage?: string | null;
}, now = Date.now()): Promise<ActionExecutionAttemptRow> {
  const row = await db.prepare(`UPDATE action_execution_attempts SET status = ?, provider_request_id = ?,
    receipt_json = ?, error_code = ?, error_message = ?, completed_at = ?, updated_at = ?
    WHERE workspace_id = ? AND id = ? AND status = 'submitting'
      AND EXISTS (SELECT 1 FROM execution_submissions s WHERE s.id = ?
        AND s.workspace_id = action_execution_attempts.workspace_id AND s.attempt_id = action_execution_attempts.id
        AND s.submission_number = action_execution_attempts.attempt_count AND s.started_at > ?)
    RETURNING *`).bind(input.status, input.providerRequestId ?? null,
      input.receipt ? JSON.stringify(input.receipt) : null, input.errorCode ?? null,
      input.errorMessage?.slice(0, 1000) ?? null, now, now, input.workspaceId, input.attemptId,
      input.submissionToken, now - SUBMISSION_LEASE_MS).first<ActionExecutionAttemptRow>();
  if (!row) throw new ActionDecisionConflict();
  return row;
}
