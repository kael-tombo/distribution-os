import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { commitConfirmedExecution } from "../db/confirmed-execution";
import { ActionDecisionConflict } from "../db/action-decisions";
import type { ActionRow } from "../db/actions-pure";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  }
  sqlite.exec(`INSERT INTO workspaces VALUES ('ws_a', 'owner_a', 'a@example.com', 'A', 'founder', 1, 1);
    INSERT INTO missions (id, workspace_id, website_url, product_name, mode, mission_json, created_at, updated_at)
      VALUES ('mission_a', 'ws_a', 'https://example.com', 'Example', 'simulation', '{}', 1, 1);
    INSERT INTO workspace_settings (id, workspace_id, created_at, updated_at) VALUES ('settings_a', 'ws_a', 1, 1);
    INSERT INTO action_queue (id, workspace_id, mission_id, action_type, channel, title, summary,
      payload_json, payload_hash, status, expires_at, idempotency_key, created_at, updated_at)
      VALUES ('action_a', 'ws_a', 'mission_a', 'send_email', 'email', 'Hello', 'Hello', '{}', 'reviewed', 'approved', 2, 'key_a', 1, 1);
    INSERT INTO action_execution_attempts (id, workspace_id, mission_id, action_id, provider,
      idempotency_key, payload_hash, status, provider_request_id, receipt_json, started_at, created_at, updated_at)
      VALUES ('attempt_a', 'ws_a', 'mission_a', 'action_a', 'resend', 'execution_a', 'reviewed', 'succeeded', 'provider_a', '{"id":"provider_a"}', 1, 1, 1);`);
  type Statement = { sql: string; values: (string | number | null)[] };
  const db = {
    prepare: (sql: string) => ({ bind: (...values: Statement["values"]) => ({ sql, values }) }),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(({ sql, values }) => ({ results: sqlite.prepare(sql).all(...values) }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  const action = () => sqlite.prepare("SELECT * FROM action_queue").get() as ActionRow;
  const count = (table: string) => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n;
  const spent = () => sqlite.prepare("SELECT daily_spent_cents, monthly_spent_cents FROM workspace_settings").get();
  return { sqlite, db, action, count, spent,
    commit: (snapshot = action()) => commitConfirmedExecution(db, snapshot, "provider_a", '{"id":"provider_a"}', 2, 100) };
}

test("confirmed receipt commits execution, audit, spend and observed evidence exactly once after expiry", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const snapshot = f.action();
  const results = await Promise.all([f.commit(snapshot), f.commit(snapshot)]);
  assert.ok(results.every((row) => row.status === "executed"));
  await f.commit();
  for (const table of ["audit_events", "touchpoints", "evidence", "mission_events"]) assert.equal(f.count(table), 1, table);
  assert.equal(f.spent()?.daily_spent_cents, 2);
  assert.equal(f.spent()?.monthly_spent_cents, 2);
  assert.equal(f.sqlite.prepare("SELECT state FROM evidence").get()?.state, "observed");
  assert.equal(f.sqlite.prepare("SELECT event_type FROM audit_events").get()?.event_type, "action.executed");
});

for (const table of ["audit_events", "evidence", "mission_events"]) {
  test(`failure writing ${table} rolls back the execution graph while retaining its recoverable receipt`, async (t) => {
    const f = fixture(); t.after(() => f.sqlite.close());
    f.sqlite.exec(`CREATE TRIGGER reject_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END`);
    await assert.rejects(f.commit(), /storage unavailable/);
    assert.equal(f.action().status, "approved");
    assert.equal(f.spent()?.daily_spent_cents, 0);
    for (const name of ["audit_events", "touchpoints", "evidence", "mission_events"]) assert.equal(f.count(name), 0);
    assert.equal(f.sqlite.prepare("SELECT status FROM action_execution_attempts").get()?.status, "succeeded");
    f.sqlite.exec("DROP TRIGGER reject_write");
    assert.equal((await f.commit()).status, "executed");
    assert.equal(f.count("audit_events"), 1);
  });
}

test("unconfirmed, mismatched or missing persisted receipts cannot create success evidence", async (t) => {
  const mutations = [
    "DELETE FROM action_execution_attempts",
    "UPDATE action_execution_attempts SET status = 'unknown'",
    "UPDATE action_execution_attempts SET provider = 'other'",
    "UPDATE action_execution_attempts SET payload_hash = 'changed'",
    "UPDATE action_execution_attempts SET provider_request_id = 'different'",
    "UPDATE action_execution_attempts SET receipt_json = '{}'",
    "UPDATE action_queue SET payload_hash = 'changed'",
    "UPDATE action_queue SET status = 'rejected'",
  ];
  for (const sql of mutations) {
    const f = fixture(); t.after(() => f.sqlite.close());
    const snapshot = f.action();
    f.sqlite.exec(sql);
    await assert.rejects(f.commit(snapshot), ActionDecisionConflict, sql);
    for (const table of ["audit_events", "touchpoints", "evidence", "mission_events"]) assert.equal(f.count(table), 0, sql);
    assert.equal(f.spent()?.daily_spent_cents, 0);
  }
});

test("cross-workspace and cross-mission receipt recovery fail closed", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  for (const change of [{ workspace_id: "ws_b" }, { mission_id: "mission_b" }, { id: "action_b" }]) {
    await assert.rejects(f.commit({ ...f.action(), ...change }), ActionDecisionConflict);
  }
  assert.equal(f.action().status, "approved");
  assert.equal(f.count("audit_events"), 0);
});
