import { env } from "cloudflare:workers";
import { getRawDb } from "../../../db";
import { ensureWorkspace, requireRequestIdentity } from "../../../db/workspaces";
import { confirmCampaignObjective, listPlanningRecords } from "../../../db/campaign-planning";
import { confirmObjectiveSchema } from "../../../lib/campaign-planning-pure";
import { plannerAvailability, type PlannerConfig } from "../../../lib/campaign-planner";
import { campaignFailure, CampaignRequestError, readCampaignJson } from "../../../lib/campaign-api";

export async function GET(request: Request) {
  try {
    const workspace = await ensureWorkspace(requireRequestIdentity(request));
    return Response.json({ records: await listPlanningRecords(getRawDb(), workspace.id), ...plannerAvailability(env as PlannerConfig, workspace.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return campaignFailure(error); }
}
export async function POST(request: Request) {
  try {
    const identity = requireRequestIdentity(request);
    const workspace = await ensureWorkspace(identity);
    const input = confirmObjectiveSchema.parse(await readCampaignJson(request));
    if (input.mode === "ai" && !plannerAvailability(env as PlannerConfig, workspace.id).ai_available) {
      throw new CampaignRequestError("AI planning is not enabled for this workspace. Choose the checklist or ask your operator to configure AI planning.", 503);
    }
    const record = await confirmCampaignObjective(getRawDb(), workspace.id, identity.userId, input);
    return Response.json({ record }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return campaignFailure(error); }
}
