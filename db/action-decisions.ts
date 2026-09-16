import { canTransition, type ActionRow } from "./actions-pure";

export class ActionDecisionConflict extends Error {
  constructor() {
    super("Action changed, expired, or is no longer eligible. Refresh and review it again.");
    this.name = "ActionDecisionConflict";
  }
}

/** Commit the decision and its evidence together, or commit neither. */
export async function commitActionDecision(
  db: D1Database,
  current: ActionRow,
  decision: "approved" | "rejected" | "expired",
  actor: string,
  options: { now?: number; payloadHash?: string; blocker?: string | null } = {},
): Promise<ActionRow> {
  const now = options.now ?? Date.now();
  if (!actor.trim() || !canTransition(current.status, decision) ||
      (decision === "approved" && options.payloadHash !== current.payload_hash) ||
      (decision === "expired" ? current.expires_at > now : current.expires_at <= now)) {
    throw new ActionDecisionConflict();
  }
  const blocker = decision === "rejected" ? options.blocker ?? null : current.blocker;
  const detail = JSON.stringify({
    mission_id: current.mission_id,
    previous_status: current.status,
    next_status: decision,
    payload_hash: current.payload_hash,
    blocker,
  });
  // D1 batch is a transaction. changes() refers to the immediately preceding
  // UPDATE; a losing compare-and-swap must not append a fictitious decision.
  const statements = [
    db.prepare(`UPDATE action_queue
      SET status = ?, decided_by = ?, decided_at = ?, blocker = ?, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND status = ? AND payload_hash = ?
        AND updated_at = ? AND expires_at = ?
        AND NOT EXISTS (SELECT 1 FROM action_execution_attempts
          WHERE workspace_id = ? AND action_id = ?
            AND status IN ('claimed', 'submitting', 'unknown', 'succeeded'))
      RETURNING *`).bind(decision, actor, now, blocker, now,
      current.workspace_id, current.id, current.status, current.payload_hash,
      current.updated_at, current.expires_at, current.workspace_id, current.id),
    db.prepare(`INSERT INTO audit_events
      (workspace_id, actor_user_id, event_category, event_type, action_id,
       resource_type, resource_id, detail_json, ip_hash, created_at)
      SELECT ?, ?, 'approval', ?, ?, 'action', ?, ?, NULL, ? WHERE changes() = 1`)
      .bind(current.workspace_id, actor, `action.${decision}`, current.id, current.id, detail, now),
  ];
  if (decision === "approved") {
    statements.push(
      db.prepare(`UPDATE missions SET approved = 1, updated_at = ?
        WHERE workspace_id = ? AND id = ? AND changes() = 1`)
        .bind(now, current.workspace_id, current.mission_id),
      db.prepare(`INSERT INTO mission_events (mission_id, event_type, title, detail, actor, created_at)
        SELECT ?, 'approval', 'Exact action approved', ?, ?, ? WHERE changes() = 1`)
        .bind(current.mission_id, `Approved action ${current.id} with payload hash ${current.payload_hash}. Execution still requires provider authorization.`, actor, now),
    );
  }
  const result = await db.batch(statements);
  const updated = result[0].results[0] as ActionRow | undefined;
  if (!updated) throw new ActionDecisionConflict();
  return updated;
}
