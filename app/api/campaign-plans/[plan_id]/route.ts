import { env } from "cloudflare:workers";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { ensureWorkspace, requireRequestIdentity } from "../../../../db/workspaces";
import { cancelPlanningJob, claimPlanningJob, finishPlanningJob, getPlanningRecord } from "../../../../db/campaign-planning";
import { generateCampaignPlan, plannerAvailability, type PlannerConfig } from "../../../../lib/campaign-planner";
import { campaignFailure, CampaignRequestError, readCampaignJson } from "../../../../lib/campaign-api";
import type { PlanResult } from "../../../../lib/campaign-planning-pure";

const actionSchema = z.object({ action: z.enum(["run", "retry", "cancel"]), expected_attempts: z.number().int().min(0).max(3) }).strict();
type Context = { params: Promise<{ plan_id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const workspace = await ensureWorkspace(requireRequestIdentity(request));
    const { plan_id } = await context.params;
    return Response.json({ record: await getPlanningRecord(getRawDb(), workspace.id, plan_id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return campaignFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const identity = requireRequestIdentity(request);
    const workspace = await ensureWorkspace(identity);
    const { plan_id } = await context.params;
    const input = actionSchema.parse(await readCampaignJson(request));
    const db = getRawDb();
    const current = await getPlanningRecord(db, workspace.id, plan_id);
    if (input.action === "cancel") {
      const record = await cancelPlanningJob(db, workspace.id, plan_id, identity.userId, input.expected_attempts);
      return Response.json({ record }, { headers: { "Cache-Control": "no-store" } });
    }
    if ((input.action === "run" && input.expected_attempts !== 0) || (input.action === "retry" && input.expected_attempts === 0)) {
      throw new CampaignRequestError("Use the action for the current saved attempt.", 409);
    }
    const config = env as PlannerConfig;
    if (current.mode === "ai" && !plannerAvailability(config, workspace.id).ai_available) {
      throw new CampaignRequestError("AI planning is no longer enabled for this workspace. The saved job has not been submitted.", 503);
    }
    const claim = await claimPlanningJob(db, workspace.id, plan_id, identity.userId, input.expected_attempts);
    let result: PlanResult | null = null;
    try {
      result = await generateCampaignPlan({ brief: claim.record.brief, objective: claim.record.objective, mode: claim.record.mode, workspaceId: workspace.id, config });
    } catch { /* Persist a bounded failure; provider output and credentials never enter error text. */ }
    // Persistence failures stay visible as unresolved claims, never disguised as provider failures.
    const record = await finishPlanningJob(db, workspace.id, plan_id, claim.token, result);
    return Response.json({ record }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return campaignFailure(error); }
}
