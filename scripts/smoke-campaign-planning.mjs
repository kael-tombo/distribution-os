import assert from "node:assert/strict";

// Use a disposable container with no volumes or provider credentials. Never
// point this write test at the normal local app or a shared/hosted workspace.
const origin = process.argv[2];
assert.equal(origin, "http://localhost:5174", "This smoke test only writes to the disposable app on localhost:5174.");
let ready = false;
for (let attempt = 0; attempt < 90 && !ready; attempt++) {
  try { ready = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Wait for the disposable runtime to compile. */ }
  if (!ready) await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(ready, "The disposable app did not start.");
assert.equal((await fetch(`${origin}/api/campaign-plans`)).status, 401);
const login = await fetch(`${origin}/__local/workspace`, { method: "POST", headers: { Origin: origin }, redirect: "manual" });
assert.equal(login.status, 303);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "Local test session was not created.");
async function request(path, body, method = body === undefined ? "GET" : "POST", expected = 200) {
  const response = await fetch(origin + path, { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
const initial = await request("/api/campaign-plans");
assert.equal(initial.ai_available, false, "Provider credentials must be absent in the disposable app.");
assert.deepEqual(initial.records, [], "Refusing to write into a nonempty planning workspace.");
assert.equal((await request("/api/campaign-brief")).current, null, "Refusing to replace an existing brief.");
const brief = { product: "Disposable planning check", objective: "Validate the local planning workflow", audience: "Test operators", channels: ["LinkedIn"], success_measure: "10 qualified demo requests", constraints: "Test data only; do not publish" };
await request("/api/campaign-brief", { expected_revision: 0, brief }, "PUT");
const input = { brief_revision: 1, mode: "checklist", objective: { metric: "Qualified demos", unit: "requests", direction: "increase", baseline: null, target: 10, source: "Test CRM report", start_date: "2026-09-08", end_date: "2026-10-08", guardrails: "Qualified, opted-in test leads only", attribution_limits: "Test data is not real conversion evidence" } };
const { record } = await request("/api/campaign-plans", input);
assert.equal(record.status, "queued");
assert.equal((await request("/api/campaign-plans", input)).record.id, record.id);
await request("/api/campaign-plans", { ...input, objective: { ...input.objective, target: 20 } }, "POST", 409);
await request("/api/campaign-plans", { ...input, mode: "ai" }, "POST", 503);
const path = `/api/campaign-plans/${record.id}`;
const { record: completed } = await request(path, { action: "run", expected_attempts: 0 });
assert.equal(completed.status, "completed");
assert.equal(completed.result.mode, "checklist");
assert.equal(completed.result.provider_response_id, null);
assert.equal(completed.objective.baseline, null);
assert.equal(completed.result.plan.channels[0].channel, "LinkedIn");
await request(path, { action: "run", expected_attempts: 0 }, "POST", 409);
assert.equal((await request(path)).record.attempts, 1);
assert.equal((await request("/api/campaign-plans")).records.length, 1);
await request("/api/campaign-plans/missing-job", undefined, "GET", 404);
await request("/api/campaign-plans", {}, "POST", 400);
console.log("Campaign HTTP smoke passed: authenticated brief → exact objective → one persisted checklist, conflict handling, mode gate and reload.");
