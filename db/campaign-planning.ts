import { campaignBriefSchema } from "../lib/campaign-brief";
import { confirmObjectiveSchema, MAX_PLAN_ATTEMPTS, objectiveSchema, PLAN_LEASE_MS, planResultSchema, validatePlan, type PlanResult, type PlanningRecord } from "../lib/campaign-planning-pure";

export class PlanningConflict extends Error {}
export class PlanningNotFound extends Error {}
type Row = {
  id: string; brief_revision: number; brief_json: string; objective_json: string;
  mode: "checklist" | "ai"; status: PlanningRecord["status"]; attempts: number;
  lease_expires_at: number | null; error: string | null; result_json: string | null;
  created_at: number; updated_at: number;
};
const projection = `SELECT j.id, b.revision AS brief_revision, b.brief_json, o.objective_json, o.mode,
  j.status, j.attempts, j.lease_expires_at, j.error, j.result_json, j.created_at, j.updated_at
  FROM campaign_planning_jobs j
  JOIN campaign_objectives o ON o.id = j.objective_id AND o.workspace_id = j.workspace_id
  JOIN campaign_brief_versions b ON b.id = o.brief_id AND b.workspace_id = j.workspace_id`;
function project(row: Row): PlanningRecord {
  const { brief_json, objective_json, result_json, ...rest } = row;
  return { ...rest, brief: campaignBriefSchema.parse(JSON.parse(brief_json)), objective: objectiveSchema.parse(JSON.parse(objective_json)), result: result_json ? planResultSchema.parse(JSON.parse(result_json)) : null };
}
export async function listPlanningRecords(db: D1Database, workspaceId: string) {
  const rows = await db.prepare(`${projection} WHERE j.workspace_id = ? ORDER BY j.created_at DESC, j.id DESC LIMIT 20`).bind(workspaceId).all<Row>();
  return rows.results.map(project);
}
export async function getPlanningRecord(db: D1Database, workspaceId: string, id: string) {
  const row = await db.prepare(`${projection} WHERE j.workspace_id = ? AND j.id = ?`).bind(workspaceId, id).first<Row>();
  if (!row) throw new PlanningNotFound("Planning job not found.");
  return project(row);
}

export async function confirmCampaignObjective(db: D1Database, workspaceId: string, actor: string, value: unknown, now = Date.now()) {
  const input = confirmObjectiveSchema.parse(value);
  const id = `plan_${crypto.randomUUID()}`;
  const objectiveJson = JSON.stringify(input.objective);
  await db.batch([
    db.prepare(`INSERT INTO campaign_objectives (id, workspace_id, brief_id, objective_json, mode, confirmed_by, created_at)
      SELECT ?, workspace_id, id, ?, ?, ?, ? FROM campaign_brief_versions
      WHERE workspace_id = ? AND revision = ? AND revision = (SELECT MAX(revision) FROM campaign_brief_versions WHERE workspace_id = ?)
      ON CONFLICT(brief_id) DO NOTHING`).bind(id, objectiveJson, input.mode, actor, now, workspaceId, input.brief_revision, workspaceId),
    db.prepare(`INSERT INTO campaign_planning_jobs (id, workspace_id, objective_id, status, attempts, created_at, updated_at)
      SELECT id, workspace_id, id, 'queued', 0, created_at, created_at FROM campaign_objectives WHERE id = ? AND workspace_id = ?`).bind(id, workspaceId),
    db.prepare(`INSERT INTO audit_events (workspace_id, actor_user_id, event_category, event_type, resource_type, resource_id, detail_json, created_at)
      SELECT workspace_id, confirmed_by, 'config', 'campaign_objective.confirmed', 'campaign_plan', id, ?, created_at
      FROM campaign_objectives WHERE id = ? AND workspace_id = ?`).bind(JSON.stringify({ brief_revision: input.brief_revision, mode: input.mode }), id, workspaceId),
  ]);
  const existing = await db.prepare(`SELECT o.id, o.objective_json, o.mode FROM campaign_objectives o
    JOIN campaign_brief_versions b ON b.id = o.brief_id AND b.workspace_id = o.workspace_id
    WHERE o.workspace_id = ? AND b.revision = ?`).bind(workspaceId, input.brief_revision).first<{ id: string; objective_json: string; mode: string }>();
  if (!existing || existing.objective_json !== objectiveJson || existing.mode !== input.mode) {
    throw new PlanningConflict("The brief or its objective has changed. Refresh before confirming; save a new brief revision to change an existing objective.");
  }
  return getPlanningRecord(db, workspaceId, existing.id);
}

export async function claimPlanningJob(db: D1Database, workspaceId: string, id: string, actor: string, expectedAttempts: number, now = Date.now()) {
  const token = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`UPDATE campaign_planning_jobs SET status = 'running', attempts = attempts + 1,
      claim_token = ?, lease_expires_at = ?, error = NULL, updated_at = ?
      WHERE id = ? AND workspace_id = ? AND attempts = ? AND attempts < ?
      AND (status IN ('queued', 'failed') OR (status = 'running' AND lease_expires_at <= ?))
      AND (SELECT COUNT(*) FROM campaign_planning_attempts WHERE workspace_id = ? AND started_at > ?) < 10
      RETURNING id`).bind(token, now + PLAN_LEASE_MS, now, id, workspaceId, expectedAttempts, MAX_PLAN_ATTEMPTS, now, workspaceId, now - 86_400_000),
    db.prepare(`UPDATE campaign_planning_attempts SET status = 'interrupted', completed_at = ?
      WHERE job_id = ? AND workspace_id = ? AND status = 'running'
      AND EXISTS (SELECT 1 FROM campaign_planning_jobs WHERE id = ? AND workspace_id = ? AND claim_token = ?)`).bind(now, id, workspaceId, id, workspaceId, token),
    db.prepare(`INSERT INTO campaign_planning_attempts (id, workspace_id, job_id, attempt_number, status, started_at)
      SELECT claim_token, workspace_id, id, attempts, 'running', updated_at FROM campaign_planning_jobs
      WHERE id = ? AND workspace_id = ? AND claim_token = ?`).bind(id, workspaceId, token),
    db.prepare(`INSERT INTO audit_events (workspace_id, actor_user_id, event_category, event_type, resource_type, resource_id, detail_json, created_at)
      SELECT workspace_id, ?, 'config', 'campaign_plan.started', 'campaign_plan', id, ?, updated_at
      FROM campaign_planning_jobs WHERE id = ? AND workspace_id = ? AND claim_token = ?`).bind(actor, JSON.stringify({ attempt: expectedAttempts + 1 }), id, workspaceId, token),
  ]);
  if (!results[0].results.length) throw new PlanningConflict("This job changed, is still running, or reached its limit (3 attempts per job; 10 attempts per workspace in 24 hours). Refresh its status.");
  return { token, record: await getPlanningRecord(db, workspaceId, id) };
}

export async function finishPlanningJob(db: D1Database, workspaceId: string, id: string, token: string, result: PlanResult | null, now = Date.now()) {
  const record = await getPlanningRecord(db, workspaceId, id);
  if (result) {
    planResultSchema.parse(result);
    validatePlan(result.plan, record.brief);
    if (result.mode !== record.mode) throw new PlanningConflict("Planner mode does not match the confirmed objective.");
  }
  const status = result ? "completed" : "failed";
  const resultJson = result ? JSON.stringify(result) : null;
  const error = result ? null : "No validated plan was saved. Review the brief or provider configuration before retrying. An AI request may already have incurred usage.";
  const results = await db.batch([
    db.prepare(`UPDATE campaign_planning_jobs SET status = ?, result_json = ?, error = ?, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND workspace_id = ? AND status = 'running' AND claim_token = ? AND lease_expires_at > ? RETURNING id`)
      .bind(status, resultJson, error, now, id, workspaceId, token, now),
    db.prepare(`UPDATE campaign_planning_attempts SET status = ?, result_json = ?, completed_at = ? WHERE id = ? AND workspace_id = ? AND status = 'running'
      AND EXISTS (SELECT 1 FROM campaign_planning_jobs WHERE id = ? AND workspace_id = ? AND claim_token = ? AND status = ?)`)
      .bind(status, resultJson, now, token, workspaceId, id, workspaceId, token, status),
    db.prepare(`INSERT INTO audit_events (workspace_id, actor_user_id, event_category, event_type, resource_type, resource_id, detail_json, created_at)
      SELECT workspace_id, 'system:campaign-planner', 'config', ?, 'campaign_plan', id, ?, updated_at
      FROM campaign_planning_jobs WHERE id = ? AND workspace_id = ? AND claim_token = ? AND status = ? AND updated_at = ?
      AND NOT EXISTS (SELECT 1 FROM audit_events WHERE resource_id = ? AND event_type = ? AND detail_json = ?)`)
      .bind(`campaign_plan.${status}`, JSON.stringify({ attempt: token }), id, workspaceId, token, status, now, id, `campaign_plan.${status}`, JSON.stringify({ attempt: token })),
  ]);
  if (!results[0].results.length) throw new PlanningConflict("This result arrived after the attempt ended. Refresh the saved job before taking another action.");
  return getPlanningRecord(db, workspaceId, id);
}

export async function cancelPlanningJob(db: D1Database, workspaceId: string, id: string, actor: string, expectedAttempts: number, now = Date.now()) {
  const cancelToken = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`UPDATE campaign_planning_jobs SET status = 'cancelled', claim_token = ?, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND workspace_id = ? AND attempts = ?
      AND (status IN ('queued', 'failed') OR (status = 'running' AND lease_expires_at <= ?)) RETURNING id`)
      .bind(cancelToken, now, id, workspaceId, expectedAttempts, now),
    db.prepare(`UPDATE campaign_planning_attempts SET status = 'interrupted', completed_at = ?
      WHERE job_id = ? AND workspace_id = ? AND status = 'running'
      AND EXISTS (SELECT 1 FROM campaign_planning_jobs WHERE id = ? AND workspace_id = ? AND claim_token = ?)`)
      .bind(now, id, workspaceId, id, workspaceId, cancelToken),
    db.prepare(`INSERT INTO audit_events (workspace_id, actor_user_id, event_category, event_type, resource_type, resource_id, detail_json, created_at)
      SELECT workspace_id, ?, 'config', 'campaign_plan.cancelled', 'campaign_plan', id, '{}', updated_at
      FROM campaign_planning_jobs WHERE id = ? AND workspace_id = ? AND claim_token = ?`).bind(actor, id, workspaceId, cancelToken),
  ]);
  if (!results[0].results.length) throw new PlanningConflict("Only queued, failed or interrupted planning jobs can be cancelled. Refresh the job.");
  return getPlanningRecord(db, workspaceId, id);
}
