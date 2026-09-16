import { z } from "zod";

const missionId = z.string().trim().min(1).max(120);

export const missionActionSchema = z.discriminatedUnion("action", [
  z.object({ mission_id: missionId, action: z.literal("advance") }).strict(),
  z.object({
    mission_id: missionId,
    action: z.literal("approve"),
    action_id: z.string().trim().min(1).max(120),
    payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
]);
