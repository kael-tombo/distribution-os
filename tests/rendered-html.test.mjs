import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => {
  await vite.close();
});

test("renders development preview metadata", async () => {
  const { default: RootLayout } = await vite.ssrLoadModule("/app/layout.tsx");
  const html = renderToStaticMarkup(
    React.createElement(
      RootLayout,
      null,
      React.createElement("main", null, "Distribution OS"),
    ),
  );

  assert.match(
    html,
    /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i,
  );
});

test("mission outcome shows an honest result and a navigable next step", async () => {
  const { MissionOutcomeCard } = await vite.ssrLoadModule("/app/workspace/mission-outcome.tsx");
  const { getMissionNextStep } = await vite.ssrLoadModule("/lib/mission-next-step.ts");
  const summary = {
    mission_id: "mission_a", current_stage: "measure", payment_count: 0,
    measurement_signal_count: 0, synthesis_mode: "simulation", can_advance: false,
    blocking_reasons: ["An external signal is required."], open_experiment_count: 1,
  };
  const render = (value) => renderToStaticMarkup(React.createElement(MissionOutcomeCard, {
    summary: { ...value, next_step: getMissionNextStep(value) }, onNavigate: () => {},
  }));
  const html = render(summary);
  assert.match(html, /First payment not yet verified/);
  assert.match(html, /Plan generated in simulation/);
  assert.match(html, /An external signal is required/);
  assert.match(html, /<button[^>]*>Review result evidence/);
  assert.doesNotMatch(html, /% ready/);
  const paid = render({ ...summary, payment_count: 1 });
  assert.match(paid, /A successful payment is recorded/);
  assert.match(paid, /does not prove the experiment caused it/);
});

test("campaign planning separates a queued job, an unknown baseline and a completed checklist from external success", async () => {
  const { CampaignPlanCard } = await vite.ssrLoadModule("/app/workspace/campaign-planning-panel.tsx");
  const { buildPlanningChecklist } = await vite.ssrLoadModule("/lib/campaign-planning-pure.ts");
  const brief = { product: "Team planner", objective: "Launch team plans", audience: "Small teams", channels: ["LinkedIn"], success_measure: "Qualified demos", constraints: "No unsupported claims" };
  const objective = { metric: "Qualified demos", unit: "requests", direction: "increase", baseline: null, target: 10, source: "CRM", start_date: "2026-09-08", end_date: "2026-10-08", guardrails: "Qualified only", attribution_limits: "Association is not causal evidence" };
  const record = { id: "plan_test", brief_revision: 2, brief, objective, mode: "checklist", status: "queued", attempts: 0, lease_expires_at: null, error: null, result: null, created_at: 100, updated_at: 100 };
  const render = record => renderToStaticMarkup(React.createElement(CampaignPlanCard, { record, busy: false, now: 500, onAction() {} }));
  const queued = render(record);
  assert.match(queued, /Ready to prepare/);
  assert.match(queued, /Unknown — collect before evaluating change/);
  assert.match(queued, /Prepare checklist/);
  assert.doesNotMatch(queued, /Plan ready for review/);
  const completed = render({ ...record, status: "completed", attempts: 1, result: { plan: buildPlanningChecklist(brief, objective), mode: "checklist", model: "deterministic-checklist", prompt_version: "campaign-strategy-v1", provider_response_id: null, input_tokens: null, output_tokens: null } });
  assert.match(completed, /Plan ready for review/);
  assert.match(completed, /no model used/);
  assert.match(completed, /Access not verified/);
  assert.match(completed, /No specialist job, account connection, production spend or publication/);
  const interrupted = render({ ...record, status: "running", attempts: 1, lease_expires_at: 400 });
  assert.match(interrupted, /Interrupted — review before retrying/);
  assert.match(interrupted, /Retry planning/);
  const cancelled = render({ ...record, status: "cancelled" });
  assert.match(cancelled, /Save as new revision/);
  assert.doesNotMatch(cancelled, /Prepare checklist|Retry planning/);
  const exhausted = render({ ...record, status: "failed", attempts: 3 });
  assert.match(exhausted, /Save as new revision/);
  assert.doesNotMatch(exhausted, /Retry planning/);
});
