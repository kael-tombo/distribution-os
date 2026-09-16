import { campaignBriefSchema, saveBriefSchema, type BriefRevision, type CampaignBrief } from "../lib/campaign-brief";

type Row = { revision: number; brief_json: string; created_at: number };
function project(row: Row): BriefRevision {
  return { revision: row.revision, brief: campaignBriefSchema.parse(JSON.parse(row.brief_json)), created_at: row.created_at };
}

export class BriefConflict extends Error {}

export async function listBriefRevisions(db: D1Database, workspaceId: string) {
  const rows = await db.prepare(
    "SELECT revision, brief_json, created_at FROM campaign_brief_versions WHERE workspace_id = ? ORDER BY revision DESC LIMIT 20",
  ).bind(workspaceId).all<Row>();
  return rows.results.map(project);
}

export async function saveBrief(db: D1Database, workspaceId: string, actor: string, expectedRevision: number, brief: CampaignBrief) {
  const input = saveBriefSchema.parse({ expected_revision: expectedRevision, brief });
  const id = `brief_${crypto.randomUUID()}`;
  const revision = expectedRevision + 1;
  const now = Date.now();
  // A single conditional insert serializes writers. Audit only the exact inserted ID,
  // in the same D1 transaction, so a stale tab cannot create a misleading event.
  const results = await db.batch([
    db.prepare(`INSERT INTO campaign_brief_versions (id, workspace_id, revision, brief_json, created_by, created_at)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE COALESCE((SELECT MAX(revision) FROM campaign_brief_versions WHERE workspace_id = ?), 0) = ?
      RETURNING revision, brief_json, created_at`)
      .bind(id, workspaceId, revision, JSON.stringify(input.brief), actor, now, workspaceId, expectedRevision),
    db.prepare(`INSERT INTO audit_events (workspace_id, actor_user_id, event_category, event_type, resource_type, resource_id, detail_json, created_at)
      SELECT workspace_id, created_by, 'config', 'campaign_brief.saved', 'campaign_brief', id, ?, created_at
      FROM campaign_brief_versions WHERE id = ? AND workspace_id = ?`)
      .bind(JSON.stringify({ revision }), id, workspaceId),
  ]);
  const row = results[0].results[0] as Row | undefined;
  if (!row) throw new BriefConflict("A newer brief was saved. Load the latest revision before saving your changes.");
  return project(row);
}
