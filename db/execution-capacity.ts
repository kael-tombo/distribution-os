/** Budgets use UTC calendar periods; quiet hours use the workspace timezone. */
export function executionPeriods(now: number) {
  const date = new Date(now);
  return {
    day: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    month: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  };
}

export async function getExecutionSpend(db: D1Database, workspaceId: string, now = Date.now()) {
  const { day, month } = executionPeriods(now);
  const row = await db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN s.started_at >= ? THEN s.projected_cost_cents ELSE 0 END), 0) AS daily_spent_cents,
    COALESCE(SUM(s.projected_cost_cents), 0) AS monthly_spent_cents
    FROM execution_submissions s JOIN action_execution_attempts a
      ON a.id = s.attempt_id AND a.workspace_id = s.workspace_id
    WHERE s.workspace_id = ? AND s.started_at >= ? AND a.status = 'succeeded'`)
    .bind(day, workspaceId, month).first<{ daily_spent_cents: number; monthly_spent_cents: number }>();
  return row ?? { daily_spent_cents: 0, monthly_spent_cents: 0 };
}
