import { env } from "cloudflare:workers";
import { ActionDecisionConflict, commitActionDecision } from "../../../../../db/action-decisions";
import { EXECUTION_RETRY_WINDOW_MS, SUBMISSION_LEASE_MS } from "../../../../../db/action-execution-claims";
import { commitConfirmedExecution } from "../../../../../db/confirmed-execution";

import { claimExecutionAttempt, finishExecutionAttempt, getExecutionAttemptByKey, markAttemptSubmitting, summarizeExecutionAttempt } from "../../../../../db/action-execution-attempts";
import { getAction, hashPayload, summarizeForDisplay, type ActionRow } from "../../../../../db/actions";
import { logAuditEvent } from "../../../../../db/audit";
import { buildConnectorId, type ConnectorInstallationRow } from "../../../../../db/connectors-pure";
import { getInstallation, updateHealth, updateInstallationStatus } from "../../../../../db/connector-installations";
import { getRawDb } from "../../../../../db/index";
import { getOrCreateSettings } from "../../../../../db/workspace-settings";
import { ensureWorkspace, requireRequestIdentity } from "../../../../../db/workspaces";
import { buildResendIdempotencyKey, evaluateResendExecutionPolicy, hourInTimezone, resendEmailPayloadSchema, sendWithResend, type ResendConfiguration } from "../../../../../lib/resend-email";

type RouteContext = { params: Promise<{ action_id: string }> };
type RuntimeEnv = { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string; RESEND_WORKSPACE_ID?: string; RESEND_ALLOWED_RECIPIENTS?: string };


export async function POST(request: Request, context: RouteContext) {
  try {
    const workspace = await ensureWorkspace(requireRequestIdentity(request));
    const { action_id } = await context.params;
    const action = await getAction(workspace.id, action_id);
    if (!action) return Response.json({ error: "Action not found." }, { status: 404 });
    if (action.status !== "approved" && action.status !== "executed") return Response.json({ error: `Action cannot be executed from status '${action.status}'.` }, { status: 400 });
    if (action.channel !== "email" || action.action_type !== "send_email") {
      return Response.json({ error: "No real provider adapter is installed for this action type." }, { status: 501 });
    }

    let rawPayload: unknown;
    try { rawPayload = JSON.parse(action.payload_json); } catch { rawPayload = null; }
    const parsedPayload = resendEmailPayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) return Response.json({ error: "The approved email payload is invalid and cannot be executed." }, { status: 422 });
    const expectedHash = await hashPayload({ action_type: action.action_type, channel: action.channel, title: action.title, summary: action.summary, payload: parsedPayload.data });
    if (expectedHash !== action.payload_hash) return Response.json({ error: "The approved payload no longer matches its immutable hash." }, { status: 409 });

    const idempotencyKey = buildResendIdempotencyKey(action.id, action.payload_hash);
    const recorded = await getExecutionAttemptByKey(workspace.id, idempotencyKey);
    if (recorded && (recorded.workspace_id !== workspace.id || recorded.action_id !== action.id ||
        recorded.mission_id !== action.mission_id || recorded.payload_hash !== action.payload_hash ||
        recorded.provider !== "resend")) {
      return Response.json({ error: "Execution idempotency record conflicts with this payload." }, { status: 409 });
    }
    // A saved provider success is an observation, not authorization for a new send.
    // Recover it even after approval expires or the sending policy changes.
    if (recorded?.status === "succeeded") {
      if (!recorded.provider_request_id) return Response.json({ error: "The saved provider success has no request ID and needs reconciliation." }, { status: 409 });
      const updated = action.status === "executed"
        ? action
        : await commitConfirmedExecution(getRawDb(), action, recorded.provider_request_id, recorded.receipt_json ?? "{}", parsedPayload.data.projected_cost_cents);
      // A previous request can have committed execution and then failed during
      // reconciliation. Replays must still finish that pending observation.
      await reconcilePendingResendEvents(updated, recorded.provider_request_id);
      return Response.json({ action: summarizeForDisplay(updated), attempt: summarizeExecutionAttempt(recorded), executed: true, idempotent: true });
    }
    if (action.status === "executed") return Response.json({ error: "The executed action has no confirmed provider receipt and needs reconciliation." }, { status: 409 });
    if (action.expires_at <= Date.now()) {
      await commitActionDecision(getRawDb(), action, "expired", "system:expiry");
      return Response.json({ error: "Action approval expired before execution." }, { status: 409 });
    }

    const runtime = env as unknown as RuntimeEnv;
    const configuration: ResendConfiguration = { apiKey: runtime.RESEND_API_KEY?.trim(), fromEmail: runtime.RESEND_FROM_EMAIL?.trim(), workspaceId: runtime.RESEND_WORKSPACE_ID?.trim(), allowedRecipients: runtime.RESEND_ALLOWED_RECIPIENTS };
    const connectorId = buildConnectorId({ workspaceId: workspace.id, provider: "Resend" });
    const connector = await getInstallation(workspace.id, connectorId);
    const settings = await getOrCreateSettings(workspace.id);
    // Dynamic workspace capacity is reserved atomically below. This check covers
    // configuration, content, quiet hours, and the individual action budget.
    const policy = evaluateResendExecutionPolicy({ payload: parsedPayload.data, settings: { ...settings, daily_spent_cents: 0, monthly_spent_cents: 0 }, workspaceId: workspace.id, currentHour: hourInTimezone(new Date(), settings.timezone), actionsToday: 0, configuration, connectorInstalled: Boolean(connector) });
    if (!policy.allowed) {
      await auditBlocked(workspace.id, workspace.owner_user_id, action, policy.code, policy.reason);
      return Response.json({ error: policy.reason, code: policy.code, executed: false }, { status: 409 });
    }

    const activeConnector = await prepareConnector(workspace.id, connector!);
    const claimed = await claimExecutionAttempt({ workspaceId: workspace.id, missionId: action.mission_id, actionId: action.id, provider: "resend", idempotencyKey, payloadHash: action.payload_hash });
    if (claimed.attempt.payload_hash !== action.payload_hash || claimed.attempt.action_id !== action.id) return Response.json({ error: "Execution idempotency record conflicts with this payload." }, { status: 409 });
    if (claimed.attempt.status === "succeeded") {
      const updated = await persistConfirmedExecution(action, claimed.attempt.provider_request_id!, claimed.attempt.receipt_json ?? "{}", parsedPayload.data.projected_cost_cents);
      return Response.json({ action: summarizeForDisplay(updated), attempt: summarizeExecutionAttempt(claimed.attempt), executed: true, idempotent: true });
    }
    if (claimed.attempt.status === "submitting" && Date.now() - claimed.attempt.updated_at < SUBMISSION_LEASE_MS) return Response.json({ error: "This exact email is already being submitted.", attempt: summarizeExecutionAttempt(claimed.attempt) }, { status: 409 });
    if (!claimed.created && Date.now() - claimed.attempt.created_at > EXECUTION_RETRY_WINDOW_MS) {
      await getRawDb().prepare("UPDATE action_queue SET status = 'blocked', blocker = ?, updated_at = ? WHERE workspace_id = ? AND id = ? AND status = 'approved'").bind("The provider result is unresolved and its safe retry window expired.", Date.now(), workspace.id, action.id).run();
      return Response.json({ error: "The provider result is unresolved and its safe retry window expired." }, { status: 409 });
    }
    const submitted = await markAttemptSubmitting(workspace.id, claimed.attempt.id, [claimed.attempt.status], settings.updated_at);
    if (!submitted) return Response.json({ error: "Execution is already claimed, its approval or settings changed, or the workspace sending allowance is exhausted. Refresh before retrying." }, { status: 409 });

    const result = await sendWithResend({ apiKey: configuration.apiKey!, idempotencyKey, payload: parsedPayload.data });
    if (result.outcome === "confirmed") {
      const attempt = await finishExecutionAttempt({ workspaceId: workspace.id, attemptId: claimed.attempt.id, submissionToken: submitted, status: "succeeded", providerRequestId: result.providerRequestId, receipt: result.receipt });
      const updated = await persistConfirmedExecution(action, result.providerRequestId, JSON.stringify(result.receipt), parsedPayload.data.projected_cost_cents);
      await markConnectorHealthy(workspace.id, activeConnector);
      return Response.json({ action: summarizeForDisplay(updated), attempt: summarizeExecutionAttempt(attempt), executed: true });
    }

    const definitive = result.outcome === "definitive_failure";
    const attempt = await finishExecutionAttempt({ workspaceId: workspace.id, attemptId: claimed.attempt.id, submissionToken: submitted, status: definitive ? "failed" : "unknown", receipt: result.receipt, errorCode: result.code, errorMessage: result.message });
    await persistFailedExecution(action, definitive, result.code, result.message, result.receipt);
    await markConnectorFailure(workspace.id, activeConnector, definitive, result.message);
    await auditResult(workspace.id, workspace.owner_user_id, action, definitive ? "action.execution_failed" : "action.execution_unknown", attempt.id, null);
    return Response.json({ error: definitive ? "Resend rejected the email." : "Resend did not return a definitive result. A safe retry remains available for 23 hours.", attempt: summarizeExecutionAttempt(attempt), executed: false }, { status: definitive ? 422 : 502 });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return Response.json({ error: "Sign in to execute actions." }, { status: 401 });
    if (error instanceof ActionDecisionConflict) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: "Action execution could not be completed. Refresh to check its recorded status before retrying." }, { status: 500 });
  }
}

async function prepareConnector(workspaceId: string, connector: ConnectorInstallationRow) {
  let current = connector;
  if (current.status === "setup_required" || current.status === "error") current = await updateInstallationStatus(workspaceId, current.id, "authorized");
  if (current.status === "authorized") current = await updateInstallationStatus(workspaceId, current.id, "connected");
  if (!["connected", "healthy", "degraded"].includes(current.status)) throw new Error(`Resend connector cannot execute from status '${current.status}'.`);
  return current;
}

async function markConnectorHealthy(workspaceId: string, connector: ConnectorInstallationRow) {
  if (connector.status === "connected" || connector.status === "degraded") return updateHealth(workspaceId, connector.id, { status: "healthy", last_error: null });
  return updateHealth(workspaceId, connector.id, { last_error: null });
}

async function markConnectorFailure(workspaceId: string, connector: ConnectorInstallationRow, definitive: boolean, message: string) {
  const status = definitive ? "error" : (connector.status === "connected" || connector.status === "healthy") ? "degraded" : undefined;
  try { await updateHealth(workspaceId, connector.id, { status, last_error: message.slice(0, 500) }); } catch {}
}

async function persistConfirmedExecution(action: ActionRow, providerRequestId: string, receiptJson: string, costCents: number) {
  const updated = await commitConfirmedExecution(getRawDb(), action, providerRequestId, receiptJson, costCents);
  await reconcilePendingResendEvents(updated, providerRequestId);
  return updated;
}

type PendingResendEventRow = {
  provider_event_id: string;
  event_type: string;
  payload_hash: string;
  occurred_at: number;
  received_at: number;
};

async function reconcilePendingResendEvents(
  action: ActionRow,
  providerRequestId: string,
): Promise<void> {
  const db = getRawDb();
  const result = await db
    .prepare("SELECT provider_event_id, event_type, payload_hash, occurred_at, received_at FROM provider_webhook_events WHERE workspace_id = ? AND provider = 'resend' AND provider_request_id = ? AND action_id IS NULL ORDER BY received_at ASC")
    .bind(action.workspace_id, providerRequestId)
    .all<PendingResendEventRow>();

  for (const event of result.results) {
    const now = Date.now();
    const title = `Resend ${event.event_type.replace("email.", "")}`;
    const detail = `Signed provider event ${event.event_type}; provider request ${providerRequestId}.`;
    const eventJson = JSON.stringify({
      provider: "resend",
      provider_event_id: event.provider_event_id,
      provider_request_id: providerRequestId,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      reconciled: true,
    });
    const evidenceState = event.event_type === "email.delivered" ? "verified" : "observed";

    await db.batch([
      db.prepare("UPDATE provider_webhook_events SET action_id = ? WHERE workspace_id = ? AND provider = 'resend' AND provider_event_id = ? AND action_id IS NULL").bind(action.id, action.workspace_id, event.provider_event_id),
      db.prepare("INSERT OR IGNORE INTO touchpoints (id, workspace_id, mission_id, action_id, experiment_id, channel, event_type, occurred_at, received_at, provider_event_id, raw_event_json, created_at) VALUES (?, ?, ?, ?, NULL, 'email', ?, ?, ?, ?, ?, ?)").bind(`tp_${event.provider_event_id}`, action.workspace_id, action.mission_id, action.id, event.event_type, event.occurred_at, event.received_at, event.provider_event_id, eventJson, now),
      db.prepare("INSERT OR IGNORE INTO evidence (id, workspace_id, mission_id, source_url, source_type, content_hash, parser_version, title, summary, extracted_facts_json, provenance_json, state, contradiction_of_id, created_at, updated_at) VALUES (?, ?, ?, NULL, 'provider_webhook', ?, '1.0', ?, ?, ?, ?, ?, NULL, ?, ?)").bind(`ev_${event.provider_event_id}`, action.workspace_id, action.mission_id, event.payload_hash, title, `Signed Resend event ${event.event_type} for the submitted email.`, JSON.stringify({ provider_request_id: providerRequestId, event_type: event.event_type, occurred_at: event.occurred_at }), JSON.stringify({ provider: "resend", svix_id: event.provider_event_id, action_id: action.id, reconciled: true }), evidenceState, now, now),
      db.prepare("INSERT INTO mission_events (mission_id, event_type, title, detail, actor, created_at) SELECT ?, 'measurement', ?, ?, 'Resend webhook reconciliation', ? WHERE NOT EXISTS (SELECT 1 FROM mission_events WHERE mission_id = ? AND event_type = 'measurement' AND detail = ?)").bind(action.mission_id, title, detail, now, action.mission_id, detail),
    ]);

    if (["email.bounced", "email.failed", "email.complained", "email.suppressed"].includes(event.event_type)) {
      await db
        .prepare("UPDATE connector_installations SET status = CASE WHEN status IN ('healthy','connected') THEN 'degraded' ELSE status END, last_error = ?, health_checked_at = ?, updated_at = ? WHERE workspace_id = ? AND provider = 'Resend'")
        .bind(`Signed provider event: ${event.event_type}`, now, now, action.workspace_id)
        .run();
    }
  }
}

async function persistFailedExecution(action: ActionRow, definitive: boolean, code: string, message: string, receipt: Record<string, unknown>) {
  await getRawDb().prepare(`UPDATE action_queue SET status = ${definitive ? "'failed'" : "status"}, blocker = ?, provider_result_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ? AND status = 'approved'`).bind(`${code}: ${message}`.slice(0, 500), JSON.stringify(receipt), Date.now(), action.workspace_id, action.id).run();
}

async function auditBlocked(workspaceId: string, actor: string, action: ActionRow, code: string, reason: string) {
  try { await logAuditEvent(workspaceId, { actor_user_id: actor, event_category: "action", event_type: "action.execution_blocked", action_id: action.id, resource_type: "action", resource_id: action.id, detail: { mission_id: action.mission_id, code, reason } }); } catch {}
}

async function auditResult(workspaceId: string, actor: string, action: ActionRow, eventType: string, attemptId: string, providerRequestId: string | null) {
  try { await logAuditEvent(workspaceId, { actor_user_id: actor, event_category: "action", event_type: eventType, action_id: action.id, resource_type: "execution_attempt", resource_id: attemptId, detail: { mission_id: action.mission_id, provider: "resend", provider_request_id: providerRequestId } }); } catch {}
}
