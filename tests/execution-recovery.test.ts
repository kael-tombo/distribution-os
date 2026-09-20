import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ActionDecisionConflict } from "../db/action-decisions";
import { EXECUTION_RETRY_WINDOW_MS, SUBMISSION_LEASE_MS } from "../db/action-execution-claims";
import * as actions from "../db/actions-pure";
import * as resend from "../lib/resend-email";
import type { ActionExecutionAttemptRow } from "../db/action-execution-attempts";

// Execute the route itself with isolated runtime boundaries. A provider call or
// a sending-policy lookup during receipt recovery is a regression.
const compiled = ts.transpileModule(
  readFileSync("app/api/actions/[action_id]/execute/route.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

async function fixture(expiresAt = 1) {
  const payload = resend.resendEmailPayloadSchema.parse({
    provider: "resend", from: "sender@example.com", to: ["recipient@example.net"],
    subject: "Reviewed subject", text: "Reviewed message", projected_cost_cents: 2,
  });
  const action: actions.ActionRow = {
    id: "action_a", workspace_id: "ws_a", mission_id: "mission_a",
    action_type: "send_email", channel: "email", title: "Email", summary: "Reviewed email",
    payload_json: JSON.stringify(payload), payload_hash: "", risk: "low", status: "approved",
    blocker: null, decided_by: "owner_a", decided_at: 0, expires_at: expiresAt,
    idempotency_key: "key_a", provider_request_json: null, provider_result_json: null,
    created_at: 0, updated_at: 0,
  };
  action.payload_hash = await actions.hashPayload({
    action_type: action.action_type, channel: action.channel, title: action.title, summary: action.summary, payload,
  });
  let attempt: ActionExecutionAttemptRow | null = {
    id: "attempt_a", workspace_id: "ws_a", mission_id: "mission_a", action_id: "action_a",
    provider: "resend", idempotency_key: resend.buildResendIdempotencyKey(action.id, action.payload_hash),
    payload_hash: action.payload_hash, status: "succeeded", attempt_count: 1,
    provider_request_id: "provider_a", receipt_json: '{"id":"provider_a"}',
    error_code: null, error_message: null, started_at: 0, completed_at: 0, created_at: 0, updated_at: 0,
  };
  let commits = 0;
  let reconciliations = 0;
  let failReconciliation = false;
  let sendingBoundaryCalls = 0;
  const forbidden = () => { sendingBoundaryCalls++; throw new Error("Sending boundary reached during recovery"); };
  const db = {
    prepare: () => ({ bind: () => ({ all: async () => {
      reconciliations++;
      if (failReconciliation) throw new Error("private database failure detail");
      return { results: [] };
    } }) }),
    batch: async () => { commits++; action.status = "executed"; },
  };
  const dependencies: Record<string, unknown> = {
    "cloudflare:workers": { env: {} },
    "db/action-decisions": { ActionDecisionConflict, commitActionDecision: async () => { action.status = "expired"; } },
    "db/action-execution-claims": { EXECUTION_RETRY_WINDOW_MS, SUBMISSION_LEASE_MS },
    "db/confirmed-execution": { commitConfirmedExecution: async () => { commits++; action.status = "executed"; return { ...action }; } },
    "db/action-execution-attempts": {
      getExecutionAttemptByKey: async (workspaceId: string, key: string) => {
        assert.equal(workspaceId, "ws_a");
        assert.equal(key, resend.buildResendIdempotencyKey(action.id, action.payload_hash));
        return attempt;
      },
      summarizeExecutionAttempt: (row: unknown) => row,
      claimExecutionAttempt: forbidden, markAttemptSubmitting: forbidden, finishExecutionAttempt: forbidden,
    },
    "db/actions": { ...actions, getAction: async () => ({ ...action }) },
    "db/audit": { logAuditEvent: async () => {} },
    "db/connectors-pure": { buildConnectorId: forbidden },
    "db/connector-installations": { getInstallation: forbidden, updateHealth: forbidden, updateInstallationStatus: forbidden },
    "db/index": { getRawDb: () => db },
    "db/workspace-settings": { getOrCreateSettings: forbidden },
    "db/workspaces": { requireRequestIdentity: () => ({}), ensureWorkspace: async () => ({ id: "ws_a", owner_user_id: "owner_a" }) },
    "lib/resend-email": { ...resend, sendWithResend: forbidden },
  };
  const exports: { POST?: (request: Request, context: { params: Promise<{ action_id: string }> }) => Promise<Response> } = {};
  runInNewContext(compiled, {
    exports, Response,
    require: (path: string) => {
      const key = path.replace(/^(\.\.\/)+/, "");
      if (!(key in dependencies)) throw new Error(`Unexpected dependency: ${key}`);
      return dependencies[key];
    },
  });
  return {
    action, attempt: attempt!, setAttempt: (value: ActionExecutionAttemptRow | null) => { attempt = value; },
    commits: () => commits, sendingBoundaryCalls: () => sendingBoundaryCalls,
    reconciliations: () => reconciliations,
    failReconciliation: (value: boolean) => { failReconciliation = value; },
    execute: () => exports.POST!(new Request("https://example.com/api/actions/action_a/execute", { method: "POST" }), { params: Promise.resolve({ action_id: "action_a" }) }),
  };
}

test("saved success recovers after expiry without credentials, policy checks, or another send", async () => {
  const f = await fixture();
  const response = await f.execute();
  assert.equal(response.status, 200);
  const body = await response.json() as { executed: boolean; idempotent: boolean; action: { status: string } };
  assert.equal(body.executed, true);
  assert.equal(body.idempotent, true);
  assert.equal(body.action.status, "executed");
  assert.equal((await f.execute()).status, 200);
  assert.equal(f.commits(), 1);
  assert.equal(f.sendingBoundaryCalls(), 0);
});

test("saved success recovers before expiry even when sending is no longer configured", async () => {
  const f = await fixture(Date.now() + 60_000);
  assert.equal((await f.execute()).status, 200);
  assert.equal(f.commits(), 1);
  assert.equal(f.sendingBoundaryCalls(), 0);
});

test("receipt recovery rejects mismatched ownership, payload, provider, and missing request IDs", async () => {
  for (const change of [
    { workspace_id: "ws_b" }, { mission_id: "mission_b" }, { action_id: "action_b" },
    { payload_hash: "changed" }, { provider: "other" }, { provider_request_id: null },
  ]) {
    const f = await fixture();
    f.setAttempt({ ...f.attempt, ...change });
    assert.equal((await f.execute()).status, 409);
    assert.equal(f.commits(), 0);
    assert.equal(f.sendingBoundaryCalls(), 0);
  }
});

test("expired approvals without a confirmed receipt cannot submit or manufacture success", async () => {
  for (const status of [null, "claimed", "submitting", "unknown", "failed"] as const) {
    const f = await fixture();
    f.setAttempt(status ? { ...f.attempt, status } : null);
    assert.equal((await f.execute()).status, 409);
    assert.equal(f.commits(), 0);
    assert.equal(f.sendingBoundaryCalls(), 0);
  }
});

test("a mutated action payload cannot be reconciled against a previously saved receipt", async () => {
  const f = await fixture();
  f.action.title = "Unreviewed change";
  assert.equal((await f.execute()).status, 409);
  assert.equal(f.commits(), 0);
});

test("replaying an executed action resumes failed reconciliation without another send or commit", async () => {
  const f = await fixture();
  f.failReconciliation(true);
  const failed = await f.execute();
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /private database failure detail/);
  assert.equal(f.action.status, "executed");
  f.failReconciliation(false);
  assert.equal((await f.execute()).status, 200);
  assert.equal(f.reconciliations(), 2);
  assert.equal(f.commits(), 1);
  assert.equal(f.sendingBoundaryCalls(), 0);
});

test("an executed label without a matching receipt does not manufacture success", async () => {
  const f = await fixture();
  f.action.status = "executed";
  f.setAttempt(null);
  assert.equal((await f.execute()).status, 409);
  assert.equal(f.commits(), 0);
  assert.equal(f.sendingBoundaryCalls(), 0);
});
