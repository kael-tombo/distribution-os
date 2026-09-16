import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { BriefConflict, listBriefRevisions, saveBrief } from "../db/campaign-briefs";
import { campaignBriefSchema, exportCampaignBrief, saveBriefSchema, type CampaignBrief } from "../lib/campaign-brief";

const brief: CampaignBrief = {
  product: "Team planning", objective: "Launch our team plan",
  audience: "Small marketing teams", channels: ["LinkedIn", "YouTube"],
  success_measure: "10 qualified demo requests in 30 days",
  constraints: "Use approved claims. Human production handoff.",
};

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  }
  sqlite.exec(`INSERT INTO workspaces VALUES ('ws_a', 'owner_a', 'a@example.com', 'A', 'founder', 1, 1);
    INSERT INTO workspaces VALUES ('ws_b', 'owner_b', 'b@example.com', 'B', 'founder', 1, 1);`);
  type Prepared = { sql: string; values: (string | number | null)[] };
  const db = {
    prepare(sql: string) {
      return { bind(...values: Prepared["values"]) {
        return { sql, values, async all() { return { results: sqlite.prepare(sql).all(...values) }; } };
      } };
    },
    async batch(statements: Prepared[]) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map(({ sql, values }) => ({ results: sqlite.prepare(sql).all(...values) }));
        sqlite.exec("COMMIT");
        return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  const audits = () => sqlite.prepare("SELECT * FROM audit_events").all();
  return { sqlite, db, audits };
}

test("briefs validate required context and reject authority fields and invalid revisions", () => {
  for (const patch of [
    { product: " " }, { audience: "" }, { objective: "x".repeat(2001) },
    { channels: [] }, { channels: ["LinkedIn", "LinkedIn"] }, { channels: ["unsupported"] },
    { workspace_id: "ws_b" }, { approved: true },
  ]) assert.equal(campaignBriefSchema.safeParse({ ...brief, ...patch }).success, false);
  for (const expected_revision of [-1, 0.5, Number.MAX_SAFE_INTEGER, "0"]) {
    assert.equal(saveBriefSchema.safeParse({ brief, expected_revision }).success, false);
  }
  assert.equal(campaignBriefSchema.parse({ ...brief, product: " Team planning " }).product, brief.product);
});

test("a fresh migrated workspace saves and reloads a brief without a mission or provider", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  assert.deepEqual(await listBriefRevisions(f.db, "ws_a"), []);
  const saved = await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.brief, brief);
  assert.deepEqual(await listBriefRevisions(f.db, "ws_a"), [saved]);
  assert.equal(f.audits().length, 1);
  assert.equal(f.audits()[0].actor_user_id, "owner_a");
  assert.equal(f.audits()[0].event_type, "campaign_brief.saved");
  assert.deepEqual(JSON.parse(String(f.audits()[0].detail_json)), { revision: 1 });
  for (const table of ["missions", "action_queue", "content_assets", "action_execution_attempts"]) {
    assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count, 0);
  }
});

test("workspace histories and revision sequences are independent", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  assert.deepEqual(await listBriefRevisions(f.db, "ws_b"), []);
  const other = await saveBrief(f.db, "ws_b", "owner_b", 0, { ...brief, product: "Other product" });
  assert.equal(other.revision, 1);
  assert.equal((await listBriefRevisions(f.db, "ws_a"))[0].brief.product, brief.product);
  assert.deepEqual(await listBriefRevisions(f.db, "ws_b"), [other]);
});

test("competing saves preserve the winner and stale retries cannot add audits", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const results = await Promise.allSettled([
    saveBrief(f.db, "ws_a", "owner_a", 0, brief),
    saveBrief(f.db, "ws_a", "owner_a", 0, { ...brief, objective: "Stale edit" }),
  ]);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "rejected"]);
  if (results[1].status === "rejected") assert.ok(results[1].reason instanceof BriefConflict);
  await assert.rejects(saveBrief(f.db, "ws_a", "owner_a", 0, brief), BriefConflict);
  assert.equal(f.audits().length, 1);
  assert.equal((await listBriefRevisions(f.db, "ws_a"))[0].brief.objective, brief.objective);
});

test("audit failure rolls back the revision so it can be retried", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'ledger unavailable'); END");
  await assert.rejects(saveBrief(f.db, "ws_a", "owner_a", 0, brief), /ledger unavailable/);
  assert.deepEqual(await listBriefRevisions(f.db, "ws_a"), []);
  assert.equal(f.audits().length, 0);
  f.sqlite.exec("DROP TRIGGER reject_audit");
  assert.equal((await saveBrief(f.db, "ws_a", "owner_a", 0, brief)).revision, 1);
});

test("invalid direct repository input cannot persist a poisoned revision", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await assert.rejects(saveBrief(f.db, "ws_a", "owner_a", 0, { ...brief, channels: [] }));
  await assert.rejects(saveBrief(f.db, "ws_a", "owner_a", -1, brief));
  assert.deepEqual(await listBriefRevisions(f.db, "ws_a"), []);
  assert.equal(f.audits().length, 0);
});

test("history shows the latest 20 immutable revisions while retaining all records for export", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  for (let revision = 0; revision < 22; revision++) {
    await saveBrief(f.db, "ws_a", "owner_a", revision, { ...brief, objective: `Objective ${revision + 1}` });
  }
  const history = await listBriefRevisions(f.db, "ws_a");
  assert.equal(history.length, 20);
  assert.equal(history[0].revision, 22);
  assert.equal(history[19].revision, 3);
  const original = f.sqlite.prepare("SELECT brief_json FROM campaign_brief_versions WHERE workspace_id = ? AND revision = 1").get("ws_a");
  assert.equal(JSON.parse(String(original?.brief_json)).objective, "Objective 1");
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_brief_versions").get()?.count, 22);
});

test("workspace deletion cascades briefs without deleting another workspace's history", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  await saveBrief(f.db, "ws_a", "owner_a", 0, brief);
  await saveBrief(f.db, "ws_b", "owner_b", 0, brief);
  f.sqlite.prepare("DELETE FROM workspaces WHERE id = ?").run("ws_a");
  assert.deepEqual(await listBriefRevisions(f.db, "ws_a"), []);
  assert.equal((await listBriefRevisions(f.db, "ws_b")).length, 1);
});

test("the portable handoff contains the exact saved instructions and planning limits", () => {
  const exported = exportCampaignBrief({ revision: 3, brief, created_at: 0 });
  for (const text of ["Revision: 3", "1970-01-01T00:00:00.000Z", brief.product, brief.objective,
    brief.audience, brief.success_measure, brief.constraints, "LinkedIn, YouTube",
    "do not imply connected accounts or permission to publish", "No production job or publication has been submitted."]) {
    assert.ok(exported.includes(text), text);
  }
});
