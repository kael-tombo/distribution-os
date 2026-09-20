import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { saveBrief } from "../db/campaign-briefs";
import { cancelPlanningJob, claimPlanningJob, confirmCampaignObjective, finishPlanningJob, getPlanningRecord, listPlanningRecords, PlanningConflict, PlanningNotFound } from "../db/campaign-planning";
import { buildPlanningChecklist, exportCampaignPlan, objectiveSchema, PLAN_LEASE_MS, type Objective, type PlanResult } from "../lib/campaign-planning-pure";
import { generateCampaignPlan } from "../lib/campaign-planner";
import { readCampaignJson, CampaignRequestError } from "../lib/campaign-api";
import { briefChannels, campaignBriefSchema, type CampaignBrief } from "../lib/campaign-brief";

const brief: CampaignBrief = { product: "Team planner", objective: "Launch team plans", audience: "Small teams", channels: ["LinkedIn", "YouTube"], success_measure: "10 qualified demos", constraints: "No unsupported claims" };
const objective: Objective = { metric: "Qualified demos", unit: "requests", direction: "increase", baseline: null, target: 10, source: "CRM qualified demos report", start_date: "2026-09-08", end_date: "2026-10-08", guardrails: "Opted-in qualified leads only", attribution_limits: "Association is not causal lift" };
const result: PlanResult = { plan: buildPlanningChecklist(brief, objective), mode: "checklist", model: "deterministic-checklist", prompt_version: "campaign-strategy-v1", provider_response_id: null, input_tokens: null, output_tokens: null };

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  sqlite.exec(`INSERT INTO workspaces VALUES ('ws_a', 'owner_a', 'a@example.com', 'A', 'founder', 1, 1);
    INSERT INTO workspaces VALUES ('ws_b', 'owner_b', 'b@example.com', 'B', 'founder', 1, 1);`);
  type Prepared = { sql: string; values: (string | number | null)[] };
  const db = {
    prepare(sql: string) { return { bind(...values: Prepared["values"]) { return {
      sql, values, async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    }; } }; },
    async batch(statements: Prepared[]) {
      sqlite.exec("BEGIN");
      try { const results = statements.map(({ sql, values }) => ({ results: sqlite.prepare(sql).all(...values) })); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  const confirm = (revision = 1) => confirmCampaignObjective(db, "ws_a", "owner_a", { brief_revision: revision, objective, mode: "checklist" }, 100);
  const audits = () => sqlite.prepare("SELECT * FROM audit_events WHERE event_type LIKE 'campaign_%' AND event_type != 'campaign_brief.saved'").all();
  return { sqlite, db, confirm, audits };
}

test("objective validation distinguishes unknown baselines and rejects invalid dates, directions and authority fields", () => {
  assert.equal(objectiveSchema.parse(objective).baseline, null);
  for (const patch of [{ end_date: "2026-02-30" }, { end_date: "2026-09-01" }, { baseline: 12 }, { target: Infinity }, { source: " " }, { workspace_id: "ws_b" }, { approved: true }]) {
    assert.equal(objectiveSchema.safeParse({ ...objective, ...patch }).success, false);
  }
  assert.equal(objectiveSchema.safeParse({ ...objective, baseline: 20, direction: "decrease" }).success, true);
  assert.equal(objectiveSchema.safeParse({ ...objective, start_date: "2028-02-29", end_date: "2028-03-01" }).success, true);
});

test("a checklist completes for maximum-length accepted brief and objective fields", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const longBrief = campaignBriefSchema.parse({
    product: "P".repeat(160), objective: "O".repeat(2000), audience: "A".repeat(2000),
    channels: [...briefChannels], success_measure: "S".repeat(1000), constraints: "C".repeat(3000),
  });
  const longObjective = objectiveSchema.parse({ ...objective,
    metric: "M".repeat(200), source: "S".repeat(500), unit: "U".repeat(80),
    guardrails: "G".repeat(1500), attribution_limits: "L".repeat(1000),
  });
  await saveBrief(f.db, "ws_a", "owner_a", 0, longBrief);
  const record = await confirmCampaignObjective(f.db, "ws_a", "owner_a", {
    brief_revision: 1, objective: longObjective, mode: "checklist",
  });
  const claim = await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000);
  const generated = await generateCampaignPlan({
    brief: claim.record.brief, objective: claim.record.objective, mode: "checklist",
    workspaceId: "ws_a", config: {}, fetchImpl: async () => { throw new Error("No provider call allowed"); },
  });
  const completed = await finishPlanningJob(f.db, "ws_a", record.id, claim.token, generated, 1100);
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.brief, longBrief);
  assert.deepEqual(completed.objective, longObjective);
  assert.equal(completed.result?.plan.channels.length, briefChannels.length);
  for (const value of [longObjective.metric, longObjective.source, longObjective.unit]) {
    assert.ok(completed.result?.plan.measurement_tasks.some(task => task.includes(value)));
  }
});

test("plan handoff retains every exact brief field and objective independently of generated summary", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  const handoff = exportCampaignPlan({ ...record, status: "completed", result });
  assert.ok(handoff.includes(JSON.stringify(brief, null, 2)));
  assert.ok(handoff.includes(JSON.stringify(objective, null, 2)));
});

test("objective confirmation atomically saves one queued command and exact reviewed inputs without dispatch", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  assert.equal(record.status, "queued"); assert.equal(record.attempts, 0);
  assert.deepEqual(record.objective, objective); assert.deepEqual(record.brief, brief);
  assert.equal(f.audits().length, 1);
  assert.equal(f.audits()[0].actor_user_id, "owner_a");
  for (const table of ["campaign_planning_attempts", "action_queue", "missions", "content_assets"]) assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count, 0);
});

test("duplicate confirmation returns the same command while changed payload and stale brief conflict", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const records = await Promise.all([f.confirm(), f.confirm()]);
  assert.equal(records[0].id, records[1].id); assert.equal(f.audits().length, 1);
  await assert.rejects(confirmCampaignObjective(f.db, "ws_a", "owner_a", { brief_revision: 1, objective: { ...objective, target: 20 }, mode: "checklist" }), PlanningConflict);
  await saveBrief(f.db, "ws_a", "owner_a", 1, brief);
  await saveBrief(f.db, "ws_a", "owner_a", 2, brief);
  await assert.rejects(f.confirm(2), PlanningConflict);
  assert.equal((await listPlanningRecords(f.db, "ws_a")).length, 1);
});

test("audit failure rolls back objective and command creation", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  f.sqlite.exec("CREATE TRIGGER no_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
  await assert.rejects(f.confirm(), /audit unavailable/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_objectives").get()?.count, 0);
  assert.deepEqual(await listPlanningRecords(f.db, "ws_a"), []);
});

test("an unchanged brief can start a new objective after cancellation without rewriting history", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const original = await f.confirm();
  await cancelPlanningJob(f.db, "ws_a", original.id, "owner_a", 0, 200);
  await saveBrief(f.db, "ws_a", "owner_a", 1, brief);
  const revisedObjective = { ...objective, target: 20 };
  const replacement = await confirmCampaignObjective(f.db, "ws_a", "owner_a", {
    brief_revision: 2, objective: revisedObjective, mode: "checklist",
  }, 300);
  assert.notEqual(replacement.id, original.id);
  assert.equal(replacement.status, "queued");
  assert.equal(replacement.brief_revision, 2);
  assert.deepEqual(replacement.brief, brief);
  assert.deepEqual(replacement.objective, revisedObjective);
  const savedOriginal = await getPlanningRecord(f.db, "ws_a", original.id);
  assert.equal(savedOriginal.status, "cancelled");
  assert.deepEqual(savedOriginal.objective, objective);
  assert.equal((await listPlanningRecords(f.db, "ws_a")).length, 2);
});

test("another workspace cannot discover, claim, finish or cancel a planning job", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  assert.deepEqual(await listPlanningRecords(f.db, "ws_b"), []);
  await assert.rejects(getPlanningRecord(f.db, "ws_b", record.id), PlanningNotFound);
  await assert.rejects(claimPlanningJob(f.db, "ws_b", record.id, "owner_b", 0), PlanningConflict);
  await assert.rejects(cancelPlanningJob(f.db, "ws_b", record.id, "owner_b", 0), PlanningConflict);
  await assert.rejects(finishPlanningJob(f.db, "ws_b", record.id, "fake", result), PlanningNotFound);
  assert.equal((await getPlanningRecord(f.db, "ws_a", record.id)).status, "queued");
  assert.equal(f.audits().length, 1);
});

test("competing claims admit one attempt and one start event", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  const claims = await Promise.allSettled([claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000), claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000)]);
  assert.deepEqual(claims.map(item => item.status), ["fulfilled", "rejected"]);
  assert.equal((await getPlanningRecord(f.db, "ws_a", record.id)).attempts, 1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_planning_attempts").get()?.count, 1);
  assert.equal(f.audits().length, 2);
});

test("the checklist runs through persisted claim, exact result, telemetry and portable export", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  const claim = await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000);
  const generated = await generateCampaignPlan({ brief: claim.record.brief, objective: claim.record.objective, mode: "checklist", workspaceId: "ws_a", config: {}, fetchImpl: async () => { throw new Error("No provider call allowed"); } });
  const completed = await finishPlanningJob(f.db, "ws_a", record.id, claim.token, generated, 1100);
  assert.equal(completed.status, "completed"); assert.deepEqual(completed.result, generated);
  assert.equal(f.sqlite.prepare("SELECT status FROM campaign_planning_attempts").get()?.status, "completed");
  assert.match(exportCampaignPlan(completed), /no model used/);
  assert.match(exportCampaignPlan(completed), /No content commissioned/);
  await assert.rejects(finishPlanningJob(f.db, "ws_a", record.id, claim.token, generated, 1100), PlanningConflict);
  assert.equal(f.audits().length, 3);
});

test("completion audit failure rolls back result and can be persisted again without regeneration", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  const claim = await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000);
  f.sqlite.exec("CREATE TRIGGER no_finish BEFORE INSERT ON audit_events WHEN NEW.event_type = 'campaign_plan.completed' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
  await assert.rejects(finishPlanningJob(f.db, "ws_a", record.id, claim.token, result, 1100), /audit unavailable/);
  assert.equal((await getPlanningRecord(f.db, "ws_a", record.id)).result, null);
  assert.equal(f.sqlite.prepare("SELECT status FROM campaign_planning_attempts").get()?.status, "running");
  f.sqlite.exec("DROP TRIGGER no_finish");
  assert.equal((await finishPlanningJob(f.db, "ws_a", record.id, claim.token, result, 1200)).status, "completed");
});

test("expired leases require an explicit new claim and fence out late old results", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  const first = await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000);
  await assert.rejects(claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 1, 1000 + PLAN_LEASE_MS - 1), PlanningConflict);
  await assert.rejects(finishPlanningJob(f.db, "ws_a", record.id, first.token, result, 1000 + PLAN_LEASE_MS), PlanningConflict);
  const second = await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 1, 1000 + PLAN_LEASE_MS);
  await assert.rejects(finishPlanningJob(f.db, "ws_a", record.id, first.token, result, 1001 + PLAN_LEASE_MS), PlanningConflict);
  assert.equal((await finishPlanningJob(f.db, "ws_a", record.id, second.token, result, 1002 + PLAN_LEASE_MS)).status, "completed");
  assert.deepEqual(f.sqlite.prepare("SELECT status FROM campaign_planning_attempts ORDER BY attempt_number").all().map(row => row.status), ["interrupted", "completed"]);
});

test("failure retries are bounded and never replay an old expected attempt", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  for (let attempt = 0; attempt < 3; attempt++) {
    const claim = await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", attempt, 1000 + attempt * 100);
    await finishPlanningJob(f.db, "ws_a", record.id, claim.token, null, 1050 + attempt * 100);
    await assert.rejects(claimPlanningJob(f.db, "ws_a", record.id, "owner_a", attempt, 1060 + attempt * 100), PlanningConflict);
  }
  await assert.rejects(claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 3, 1400), PlanningConflict);
  assert.equal((await getPlanningRecord(f.db, "ws_a", record.id)).attempts, 3);
});

test("rolling workspace limit is enforced at the claim boundary", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  for (let revision = 0; revision < 11; revision++) {
    await saveBrief(f.db, "ws_a", "owner_a", revision, brief);
    const record = await f.confirm(revision + 1);
    if (revision < 10) await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000);
    else {
      await assert.rejects(claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1001), PlanningConflict);
      assert.equal((await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000 + 86_400_000)).record.attempts, 1);
    }
  }
});

test("cancelled work cannot dispatch; a live attempt cannot falsely claim cancellation", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  const claim = await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000);
  await assert.rejects(cancelPlanningJob(f.db, "ws_a", record.id, "owner_a", 1, 1001), PlanningConflict);
  const cancelled = await cancelPlanningJob(f.db, "ws_a", record.id, "owner_a", 1, 1000 + PLAN_LEASE_MS);
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(finishPlanningJob(f.db, "ws_a", record.id, claim.token, result, 1001 + PLAN_LEASE_MS), PlanningConflict);
  await assert.rejects(claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 1, 1002 + PLAN_LEASE_MS), PlanningConflict);
});

test("mode substitution and unreviewed channels cannot persist as a completed plan", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  const claim = await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000);
  await assert.rejects(finishPlanningJob(f.db, "ws_a", record.id, claim.token, { ...result, mode: "ai" }, 1100), PlanningConflict);
  await assert.rejects(finishPlanningJob(f.db, "ws_a", record.id, claim.token, { ...result, plan: { ...result.plan, channels: [{ ...result.plan.channels[0], channel: "TikTok" }] } }, 1100));
  assert.equal((await getPlanningRecord(f.db, "ws_a", record.id)).result, null);
});

test("workspace deletion removes objective, job and attempt lineage", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  const record = await f.confirm();
  await claimPlanningJob(f.db, "ws_a", record.id, "owner_a", 0, 1000);
  f.sqlite.exec("DELETE FROM workspaces WHERE id = 'ws_a'");
  for (const table of ["campaign_objectives", "campaign_planning_jobs", "campaign_planning_attempts"]) assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count, 0);
});

test("bounded JSON intake rejects an oversized streamed request before consuming the rest", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(40_001)); }, cancel() { cancelled = true; } });
  const request = new Request("https://example.com", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readCampaignJson(request), (error: unknown) => error instanceof CampaignRequestError && error.status === 413);
  assert.equal(cancelled, true);
});
