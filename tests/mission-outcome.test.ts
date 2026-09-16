import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MISSION_MEASUREMENT_SIGNALS_SQL } from "../db/mission-signals";
import { getMissionReadiness } from "../lib/mission-lifecycle-pure";
import { getMissionNextStep } from "../lib/mission-next-step";

test("learning requires external feedback, excluding assumptions, API acceptance and unsuccessful payments", t => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  for (const file of readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort()) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  db.exec(`INSERT INTO workspaces VALUES ('ws_a', 'owner_a', 'a@example.com', 'A', 'founder', 1, 1);
    INSERT INTO workspaces VALUES ('ws_b', 'owner_b', 'b@example.com', 'B', 'founder', 1, 1);
    INSERT INTO missions (id, workspace_id, website_url, product_name, mode, mission_json, created_at, updated_at)
      VALUES ('mission_a', 'ws_a', 'https://example.com', 'A', 'simulation', '{}', 1, 1),
      ('mission_b', 'ws_b', 'https://example.com', 'B', 'live', '{}', 1, 1);
    INSERT INTO action_queue (id, workspace_id, mission_id, action_type, channel, title, summary, payload_json, payload_hash, status, expires_at, idempotency_key, created_at, updated_at)
      VALUES ('action_a', 'ws_a', 'mission_a', 'send_email', 'email', 'Hi', 'Hi', '{}', 'hash', 'executed', 2, 'key', 1, 1);
    INSERT INTO evidence (id, workspace_id, mission_id, source_type, content_hash, parser_version, title, summary, extracted_facts_json, provenance_json, state, created_at, updated_at)
      VALUES ('inference', 'ws_a', 'mission_a', 'inference', 'hash', '1', 'Assumption', 'Assumption', '{}', '{}', 'verified', 1, 1);
    INSERT INTO touchpoints (id, workspace_id, mission_id, channel, event_type, occurred_at, received_at, raw_event_json, created_at)
      VALUES ('acceptance', 'ws_a', 'mission_a', 'email', 'provider_accepted', 1, 1, '{}', 1);
    INSERT INTO payments (id, workspace_id, mission_id, provider, provider_payment_id, amount_cents, currency, status, received_at, raw_event_json, created_at, updated_at)
      VALUES ('pay', 'ws_a', 'mission_a', 'stripe', 'pay_1', 100, 'USD', 'failed', 1, '{}', 1, 1);`);
  const count = (workspace = 'ws_a', mission = 'mission_a') => Number(db.prepare(MISSION_MEASUREMENT_SIGNALS_SQL).get(workspace, mission, workspace, mission)?.count);
  const ready = () => getMissionReadiness({ current_stage: "measure", cycle_number: 1, approved: true, payment_count: 0 }, { openExperiments: 1, measurementSignals: count() }).can_advance;
  assert.equal(count(), 0);
  assert.equal(ready(), false);
  db.exec(`INSERT INTO provider_webhook_events VALUES ('event', 'ws_a', 'action_a', 'resend', 'evt_1', 'email_1', 'email.sent', 'hash', 1, 1, 1);`);
  assert.equal(count(), 0);
  for (const type of ['email.delivered', 'email.bounced', 'email.failed', 'email.opened', 'email.clicked', 'email.complained', 'email.suppressed']) {
    db.prepare('UPDATE provider_webhook_events SET event_type = ?').run(type);
    assert.equal(count(), 1, type);
    assert.equal(ready(), true, type);
  }
  assert.equal(count('ws_b', 'mission_b'), 0);
  assert.equal(count('ws_b', 'mission_a'), 0);
  assert.equal(count('ws_a', 'mission_b'), 0);
  db.exec("UPDATE provider_webhook_events SET workspace_id = 'ws_b'");
  assert.equal(count('ws_b', 'mission_a'), 0, "an event cannot borrow an action from another workspace");
  db.exec("UPDATE provider_webhook_events SET workspace_id = 'ws_a'");
  db.exec("UPDATE provider_webhook_events SET action_id = NULL");
  assert.equal(count(), 0, "unmatched webhooks are not mission results");
  db.exec("UPDATE payments SET status = 'succeeded'");
  assert.equal(count(), 1);
  db.exec("UPDATE payments SET status = 'refunded'");
  assert.equal(count(), 0);
});

test("next steps direct a founder to evidence and decisions without executing actions", () => {
  const base = { current_stage: "observe", payment_count: 0, open_experiment_count: 1, can_advance: false };
  for (const [stage, destination] of Object.entries({ observe: "evidence", decide: "experiments", approve: "actions", act: "actions", measure: "evidence", learn: "experiments" })) {
    const step = getMissionNextStep({ ...base, current_stage: stage });
    assert.equal(step.destination, destination);
    assert.ok(step.result.length > 0);
  }
  assert.match(getMissionNextStep({ ...base, current_stage: "measure" }).title, /Wait/);
  assert.equal(getMissionNextStep({ ...base, current_stage: "measure", open_experiment_count: 0 }).destination, "experiments");
  const paid = getMissionNextStep({ ...base, payment_count: 1 });
  assert.equal(paid.destination, "revenue");
  assert.match(paid.reason, /does not prove/);
  assert.match(getMissionNextStep({ ...base, current_stage: "unknown" }).reason, /unavailable/);
});
