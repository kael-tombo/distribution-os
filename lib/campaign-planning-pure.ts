import { z } from "zod";
import { briefChannels, campaignBriefSchema, type CampaignBrief } from "./campaign-brief";

const text = (max: number) => z.string().trim().min(1).max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid calendar date.");

export const objectiveSchema = z.object({
  metric: text(200), unit: text(80), direction: z.enum(["increase", "decrease"]),
  baseline: z.number().finite().nonnegative().max(1e12).nullable(),
  target: z.number().finite().nonnegative().max(1e12),
  source: text(500), start_date: day, end_date: day,
  guardrails: text(1500), attribution_limits: text(1000),
}).strict().superRefine((value, ctx) => {
  if (value.end_date < value.start_date) ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date must be on or after the start date." });
  if (value.baseline !== null && (value.direction === "increase" ? value.target <= value.baseline : value.target >= value.baseline)) {
    ctx.addIssue({ code: "custom", path: ["target"], message: "Target must improve on the baseline in the chosen direction." });
  }
});
export const planningModeSchema = z.enum(["checklist", "ai"]);
export const confirmObjectiveSchema = z.object({
  brief_revision: z.number().int().positive(), objective: objectiveSchema, mode: planningModeSchema,
}).strict();
export const planSchema = z.object({
  summary: text(1800), hypothesis: text(1200),
  channels: z.array(z.object({ channel: z.enum(briefChannels), rationale: text(1000), production_brief: text(1800) }).strict()).min(1).max(8),
  measurement_tasks: z.array(text(800)).min(1).max(8),
  unknowns: z.array(text(800)).min(1).max(8), next_decision: text(1000),
}).strict();
export const planResultSchema = z.object({
  plan: planSchema, mode: planningModeSchema, model: text(160), prompt_version: text(80),
  provider_response_id: text(200).nullable(), input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
});
export type Objective = z.infer<typeof objectiveSchema>;
export type CampaignPlan = z.infer<typeof planSchema>;
export type PlanResult = z.infer<typeof planResultSchema>;
export type PlanningMode = z.infer<typeof planningModeSchema>;
export const PLAN_PROMPT_VERSION = "campaign-strategy-v1";
export const PLAN_LEASE_MS = 120_000;
export const MAX_PLAN_ATTEMPTS = 3;

export function validatePlan(value: unknown, brief: CampaignBrief): CampaignPlan {
  const plan = planSchema.parse(value);
  const channels = plan.channels.map(item => item.channel);
  if (new Set(channels).size !== channels.length || channels.some(channel => !brief.channels.includes(channel))) {
    throw new Error("Plan channels must be unique and selected in the reviewed brief.");
  }
  return plan;
}

export function buildPlanningChecklist(brief: CampaignBrief, objective: Objective): CampaignPlan {
  return validatePlan({
    summary: `Prepare a campaign for ${brief.product}. Use your saved brief and confirmed objective to review these preparation steps before commissioning production.`,
    hypothesis: "Audience and channel fit still need evidence. This checklist does not predict performance.",
    channels: brief.channels.map(channel => ({
      channel, rationale: "Selected by the owner; confirm audience fit and account capabilities before committing production.",
      production_brief: `Ask a qualified specialist to propose a ${channel} deliverable for the reviewed audience. Provide approved product claims, source material and the campaign objective. Review format, accessibility and rights before commissioning.`,
    })),
    measurement_tasks: [
      `Define ${objective.metric}; report values in ${objective.unit}.`,
      `Inspect the measurement source: ${objective.source}.`,
      objective.baseline === null ? "Record a baseline before evaluating change; missing data is not zero." : `Verify the owner-reported baseline of ${objective.baseline} against its original source.`,
      `Review results for ${objective.start_date} through ${objective.end_date}. Target: ${objective.target}.`,
    ],
    unknowns: ["No account capability or production provider has been verified by this planning job.", "The brief and objective are owner instructions, not independently verified research."],
    next_decision: "Review the measurement source and qualify a production partner. This plan does not authorize spending or publication.",
  }, brief);
}

export const planningRecordSchema = z.object({
  id: z.string(), brief_revision: z.number(), brief: campaignBriefSchema, objective: objectiveSchema,
  mode: planningModeSchema, status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  attempts: z.number(), lease_expires_at: z.number().nullable(), error: z.string().nullable(),
  result: planResultSchema.nullable(), created_at: z.number(), updated_at: z.number(),
});
export type PlanningRecord = z.infer<typeof planningRecordSchema>;
export const planningSnapshotSchema = z.object({
  records: z.array(planningRecordSchema), ai_available: z.boolean(), ai_blocker: z.string().nullable(),
});

export function exportCampaignPlan(record: PlanningRecord): string {
  if (!record.result) throw new Error("No completed plan to download.");
  const { plan } = record.result;
  return [
    `Distribution OS — ${record.brief.product}`, `Brief revision: ${record.brief_revision}`,
    `Planning mode: ${record.mode === "ai" ? "AI proposal; unverified inference" : "Deterministic checklist; no model used"}`,
    "Status: For review. No content commissioned, spending authorized or publication submitted.",
    "", "Saved campaign brief", JSON.stringify(record.brief, null, 2),
    "", "Objective contract", JSON.stringify(record.objective, null, 2),
    "", "Summary", plan.summary, "", "Hypothesis", plan.hypothesis,
    ...plan.channels.flatMap(item => ["", item.channel, item.rationale, item.production_brief]),
    "", "Measurement tasks", ...plan.measurement_tasks, "", "Unknowns", ...plan.unknowns,
    "", "Next decision", plan.next_decision, "",
  ].join("\n");
}
