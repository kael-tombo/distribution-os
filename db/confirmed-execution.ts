import { ActionDecisionConflict } from "./action-decisions";
import type { ActionRow } from "./actions-pure";

/** Materialize a saved provider receipt without performing an external action. */
export async function commitConfirmedExecution(
  db: D1Database,
  action: ActionRow,
  providerRequestId: string,
  receiptJson: string,
  costCents: number,
  now = Date.now(),
): Promise<ActionRow> {
  if (!providerRequestId.trim() || !Number.isSafeInteger(costCents) || costCents < 0) {
    throw new ActionDecisionConflict();
  }
  // Every write is gated by the durable receipt and exact action identity. The
  // predicate also applies on replay, so a stale caller cannot invent evidence.
  const confirmed = `EXISTS (SELECT 1 FROM action_queue AS action
    JOIN action_execution_attempts AS attempt
      ON attempt.workspace_id = action.workspace_id AND attempt.action_id = action.id
      AND attempt.mission_id = action.mission_id AND attempt.payload_hash = action.payload_hash
    WHERE action.workspace_id = ? AND action.id = ? AND action.mission_id = ?
      AND action.payload_hash = ? AND action.status IN ('approved', 'executed')
      AND attempt.provider = 'resend' AND attempt.status = 'succeeded'
      AND attempt.provider_request_id = ? AND attempt.receipt_json = ?)`;
  const proof = [action.workspace_id, action.id, action.mission_id, action.payload_hash, providerRequestId, receiptJson];
  const detail = JSON.stringify({ mission_id: action.mission_id, provider: "resend", provider_request_id: providerRequestId, payload_hash: action.payload_hash });
  const executionDetail = `Resend accepted action ${action.id}. Delivery remains unverified.`;
  const results = await db.batch([
    db.prepare(`UPDATE action_queue SET status = 'executed', blocker = NULL,
      provider_result_json = ?, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND status = 'approved' AND ${confirmed}
      RETURNING *`).bind(receiptJson, now, action.workspace_id, action.id, ...proof),
    // changes() links the audit to the winning state transition. An unavailable
    // audit ledger rolls the entire batch back; the receipt remains recoverable.
    db.prepare(`INSERT INTO audit_events (workspace_id, actor_user_id, event_category,
      event_type, action_id, resource_type, resource_id, detail_json, ip_hash, created_at)
      SELECT ?, 'system:resend-receipt', 'action', 'action.executed', ?, 'action', ?, ?, NULL, ?
      WHERE changes() = 1`).bind(action.workspace_id, action.id, action.id, detail, now),
    db.prepare(`INSERT OR IGNORE INTO touchpoints (id, workspace_id, mission_id, action_id,
      experiment_id, channel, event_type, occurred_at, received_at, provider_event_id, raw_event_json, created_at)
      SELECT ?, ?, ?, ?, NULL, 'email', 'provider_accepted', ?, ?, ?, ?, ? WHERE ${confirmed}`)
      .bind(`tp_provider_${action.id}`, action.workspace_id, action.mission_id, action.id, now, now, providerRequestId, receiptJson, now, ...proof),
    db.prepare(`INSERT OR IGNORE INTO evidence (id, workspace_id, mission_id, source_url,
      source_type, content_hash, parser_version, title, summary, extracted_facts_json,
      provenance_json, state, contradiction_of_id, created_at, updated_at)
      SELECT ?, ?, ?, NULL, 'provider_receipt', ?, '1.0', 'Resend accepted email',
      'The provider accepted the exact approved email payload; delivery is not yet proven.',
      ?, ?, 'observed', NULL, ?, ? WHERE ${confirmed}`)
      .bind(`ev_provider_${action.id}`, action.workspace_id, action.mission_id, action.payload_hash,
        JSON.stringify({ provider_request_id: providerRequestId, event: "provider_accepted" }),
        JSON.stringify({ provider: "resend", action_id: action.id }), now, now, ...proof),
    db.prepare(`INSERT INTO mission_events (mission_id, event_type, title, detail, actor, created_at)
      SELECT ?, 'execution', 'Approved email submitted', ?, 'Resend adapter', ?
      WHERE ${confirmed} AND NOT EXISTS (SELECT 1 FROM mission_events
        WHERE mission_id = ? AND event_type = 'execution' AND detail = ?)`)
      .bind(action.mission_id, executionDetail, now, ...proof, action.mission_id, executionDetail),
    db.prepare(`SELECT * FROM action_queue WHERE workspace_id = ? AND id = ?
      AND status = 'executed' AND ${confirmed}`).bind(action.workspace_id, action.id, ...proof),
  ]);
  const updated = results[results.length - 1].results[0] as ActionRow | undefined;
  if (!updated) throw new ActionDecisionConflict();
  return updated;
}
