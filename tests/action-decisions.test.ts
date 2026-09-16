import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionDecisionConflict, commitActionDecision } from "../db/action-decisions";
import { beginApprovedSubmission, claimApprovedExecution } from "../db/action-execution-claims";
import { missionActionSchema } from "../lib/mission-action-input";
import type { ActionRow } from "../db/actions-pure";

/** Execute production SQL against the actual migrations, with D1 batch semantics. */
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  }
  sqlite.exec(`INSERT INTO workspaces VALUES ('ws_a', 'owner_a', 'a@example.com', 'A', 'founder', 1, 1);
    INSERT INTO workspaces VALUES ('ws_b', 'owner_b', 'b@example.com', 'B', 'founder', 1, 1);
    INSERT INTO missions (id, workspace_id, website_url, product_name, mode, mission_json, created_at, updated_at)
      VALUES ('mission_a', 'ws_a', 'https://example.com', 'Example', 'simulation', '{}', 1, 1);
    INSERT INTO action_queue (id, workspace_id, mission_id, action_type, channel, title, summary,
      payload_json, payload_hash, expires_at, idempotency_key, created_at, updated_at)
      VALUES ('action_a', 'ws_a', 'mission_a', 'send_email', 'email', 'Hello', 'Hello', '{}', 'reviewed', 100, 'key_a', 1, 1);`);
  type Prepared = { sql: string; values: (string | number | null)[] };
  const db = {
    prepare(sql: string) {
      return { bind(...values: Prepared["values"]) {
        return {
          sql, values,
          async run() { return { meta: sqlite.prepare(sql).run(...values) }; },
          async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        };
      } };
    },
    async batch(statements: Prepared[]) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map(({ sql, values }) => ({ results: sqlite.prepare(sql).all(...values) }));
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  const row = () => sqlite.prepare("SELECT * FROM action_queue WHERE id = 'action_a'").get() as ActionRow;
  const audits = () => sqlite.prepare("SELECT * FROM audit_events").all();
  return { sqlite, db, row, audits };
}

test("approval persists the reviewed hash and actor with exactly one audit event", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const updated = await commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" });
  assert.equal(updated.status, "approved");
  assert.equal(f.row().decided_by, "owner_a");
  assert.equal(f.audits().length, 1);
  assert.equal(JSON.parse(String(f.audits()[0].detail_json)).payload_hash, "reviewed");
  assert.equal(f.sqlite.prepare("SELECT approved FROM missions").get()?.approved, 1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM mission_events WHERE event_type = 'approval'").get()?.count, 1);
});

test("an unavailable audit ledger rolls back the approval", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'ledger unavailable'); END");
  await assert.rejects(commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" }), /ledger unavailable/);
  assert.equal(f.row().status, "prepared");
  assert.equal(f.row().decided_by, null);
  assert.equal(f.audits().length, 0);
  assert.equal(f.sqlite.prepare("SELECT approved FROM missions").get()?.approved, 0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM mission_events").get()?.count, 0);
});

test("mission approval requires an exact action and reviewed hash while advance stays compatible", () => {
  const request = { mission_id: "mission_a", action: "approve" };
  assert.equal(missionActionSchema.safeParse(request).success, false);
  assert.equal(missionActionSchema.safeParse({ ...request, action_id: "action_a" }).success, false);
  assert.equal(missionActionSchema.safeParse({ ...request, action_id: "action_a", payload_hash: "a".repeat(64) }).success, true);
  assert.equal(missionActionSchema.safeParse({ mission_id: "mission_a", action: "advance" }).success, true);
});

test("mission event failure rolls back the action, audit, and mission approval together", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec("CREATE TRIGGER reject_mission_event BEFORE INSERT ON mission_events BEGIN SELECT RAISE(ABORT, 'event unavailable'); END");
  await assert.rejects(commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" }), /event unavailable/);
  assert.equal(f.row().status, "prepared");
  assert.equal(f.audits().length, 0);
  assert.equal(f.sqlite.prepare("SELECT approved FROM missions").get()?.approved, 0);
});

test("competing approval and rejection cannot overwrite the winning decision", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const snapshot = f.row();
  const results = await Promise.allSettled([
    commitActionDecision(f.db, snapshot, "rejected", "owner_a", { now: 50, blocker: "Revise the claim" }),
    commitActionDecision(f.db, snapshot, "approved", "owner_a", { now: 50, payloadHash: "reviewed" }),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected"]);
  assert.equal(f.row().status, "rejected");
  assert.equal(f.row().blocker, "Revise the claim");
  assert.equal(f.audits().length, 1);
});

test("stale payload, stale version, and another tenant cannot record a decision", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  for (const snapshot of [
    { ...f.row(), payload_hash: "different" },
    { ...f.row(), updated_at: 0 },
    { ...f.row(), workspace_id: "ws_b" },
  ]) {
    await assert.rejects(commitActionDecision(f.db, snapshot, "approved", "owner_a", { now: 50, payloadHash: snapshot.payload_hash }), ActionDecisionConflict);
  }
  assert.equal(f.row().status, "prepared");
  assert.equal(f.audits().length, 0);
});

test("the exact reviewed hash is mandatory even for direct repository callers", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  for (const payloadHash of [undefined, "wrong"]) {
    await assert.rejects(commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash }), ActionDecisionConflict);
  }
  assert.equal(f.audits().length, 0);
});

test("expiry is audited and cannot overwrite terminal decisions", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await assert.rejects(commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 100, payloadHash: "reviewed" }), ActionDecisionConflict);
  await commitActionDecision(f.db, f.row(), "expired", "system:expiry", { now: 100 });
  await assert.rejects(commitActionDecision(f.db, f.row(), "expired", "system:expiry", { now: 101 }), ActionDecisionConflict);
  assert.equal(f.audits()[0].event_type, "action.expired");
  assert.equal(f.audits().length, 1);
});

test("expiry preserves in-flight and ambiguous provider attempts for reconciliation", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" });
  f.sqlite.exec(`INSERT INTO action_execution_attempts (id, workspace_id, mission_id, action_id, provider,
    idempotency_key, payload_hash, status, started_at, created_at, updated_at)
    VALUES ('attempt_a', 'ws_a', 'mission_a', 'action_a', 'resend', 'attempt_key', 'reviewed', 'claimed', 60, 60, 60)`);
  for (const status of ["claimed", "submitting", "unknown", "succeeded"]) {
    f.sqlite.prepare("UPDATE action_execution_attempts SET status = ?").run(status);
    await assert.rejects(commitActionDecision(f.db, f.row(), "expired", "system:expiry", { now: 100 }), ActionDecisionConflict);
  }
  assert.equal(f.row().status, "approved");
  assert.equal(f.audits().length, 1);
});

const claimInput = {
  workspaceId: "ws_a", missionId: "mission_a", actionId: "action_a",
  provider: "resend", idempotencyKey: "attempt_key", payloadHash: "reviewed",
};

test("execution cannot claim a prepared, expired, or mismatched approval", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await assert.rejects(claimApprovedExecution(f.db, claimInput, 50), ActionDecisionConflict);
  await commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" });
  for (const input of [
    { ...claimInput, workspaceId: "ws_b" },
    { ...claimInput, missionId: "another_mission" },
    { ...claimInput, payloadHash: "changed" },
  ]) {
    await assert.rejects(claimApprovedExecution(f.db, input, 60), ActionDecisionConflict);
  }
  await assert.rejects(claimApprovedExecution(f.db, claimInput, 100), ActionDecisionConflict);
  await commitActionDecision(f.db, f.row(), "expired", "system:expiry", { now: 100 });
  await assert.rejects(claimApprovedExecution(f.db, claimInput, 101), ActionDecisionConflict);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM action_execution_attempts").get()?.count, 0);
});

test("a winning execution claim blocks expiry and allows only one submission", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" });
  const snapshot = f.row();
  const first = await claimApprovedExecution(f.db, claimInput, 60);
  const second = await claimApprovedExecution(f.db, claimInput, 61);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.attempt.id, second.attempt.id);
  await assert.rejects(commitActionDecision(f.db, snapshot, "expired", "system:expiry", { now: 100 }), ActionDecisionConflict);
  assert.equal(await beginApprovedSubmission(f.db, "ws_b", first.attempt.id, ["claimed"], 70), false);
  assert.equal(await beginApprovedSubmission(f.db, "ws_a", first.attempt.id, ["claimed"], 70), true);
  assert.equal(await beginApprovedSubmission(f.db, "ws_a", first.attempt.id, ["claimed"], 71), false);
  assert.equal(f.row().status, "approved");
});

test("submission rechecks expiry even when a claim was acquired before the deadline", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" });
  const { attempt } = await claimApprovedExecution(f.db, claimInput, 60);
  assert.equal(await beginApprovedSubmission(f.db, "ws_a", attempt.id, ["claimed"], 100), false);
});

test("expiry winning a failed-attempt retry prevents provider resubmission", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" });
  const { attempt } = await claimApprovedExecution(f.db, claimInput, 60);
  f.sqlite.exec("UPDATE action_execution_attempts SET status = 'failed'");
  await commitActionDecision(f.db, f.row(), "expired", "system:expiry", { now: 100 });
  assert.equal(await beginApprovedSubmission(f.db, "ws_a", attempt.id, ["failed"], 101), false);
  assert.equal(f.sqlite.prepare("SELECT status FROM action_execution_attempts").get()?.status, "failed");
});

test("a reused idempotency key cannot claim another action's receipt", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await commitActionDecision(f.db, f.row(), "approved", "owner_a", { now: 50, payloadHash: "reviewed" });
  await claimApprovedExecution(f.db, claimInput, 60);
  for (const input of [
    { ...claimInput, actionId: "another_action" },
    { ...claimInput, missionId: "another_mission" },
    { ...claimInput, payloadHash: "changed" },
    { ...claimInput, provider: "another_provider" },
  ]) {
    await assert.rejects(claimApprovedExecution(f.db, input, 70), ActionDecisionConflict);
  }
});
