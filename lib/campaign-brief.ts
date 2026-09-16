import { z } from "zod";

export const briefChannels = ["Website", "Email", "LinkedIn", "X", "Instagram", "TikTok", "YouTube", "Reddit"] as const;

export const campaignBriefSchema = z.object({
  product: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(2000),
  audience: z.string().trim().min(1).max(2000),
  channels: z.array(z.enum(briefChannels)).min(1).max(briefChannels.length)
    .refine(items => new Set(items).size === items.length, "Choose each channel once."),
  success_measure: z.string().trim().min(1).max(1000),
  constraints: z.string().trim().max(3000),
}).strict();

export const saveBriefSchema = z.object({
  expected_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  brief: campaignBriefSchema,
}).strict();

export type CampaignBrief = z.infer<typeof campaignBriefSchema>;
export const briefRevisionSchema = z.object({
  revision: z.number().int().positive(),
  brief: campaignBriefSchema,
  created_at: z.number().int().nonnegative(),
});
export const briefHistorySchema = z.object({
  current: briefRevisionSchema.nullable(),
  revisions: z.array(briefRevisionSchema).max(20),
});
export const briefSavedSchema = z.object({ current: briefRevisionSchema });
export type BriefRevision = z.infer<typeof briefRevisionSchema>;

export function exportCampaignBrief(record: BriefRevision) {
  return [
    "Distribution OS — Campaign brief",
    `Revision: ${record.revision}`,
    `Saved: ${new Date(record.created_at).toISOString()}`,
    "Status: Planning brief. Channel preferences do not imply connected accounts or permission to publish.",
    "", "Product", record.brief.product,
    "", "Objective", record.brief.objective,
    "", "Audience", record.brief.audience,
    "", "Preferred channels", record.brief.channels.join(", "),
    "", "Success measure", record.brief.success_measure,
    "", "Constraints and production notes", record.brief.constraints || "None specified.",
    "", "Human handoff: review this brief with your production partner. No production job or publication has been submitted.",
    "",
  ].join("\n");
}
