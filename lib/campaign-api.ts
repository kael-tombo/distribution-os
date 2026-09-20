import { z } from "zod";
import { PlanningConflict, PlanningNotFound } from "../db/campaign-planning";

export class CampaignRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function readCampaignJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new CampaignRequestError("A JSON request body is required.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 40_000) {
        await reader.cancel();
        throw new CampaignRequestError("This planning request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function campaignFailure(error: unknown) {
  let status = 500;
  let message = "Campaign planning is unavailable. Refresh the saved state before retrying.";
  if (error instanceof Error && error.message === "AUTH_REQUIRED") { status = 401; message = "Sign in to open campaign planning."; }
  else if (error instanceof PlanningNotFound) { status = 404; message = error.message; }
  else if (error instanceof PlanningConflict) { status = 409; message = error.message; }
  else if (error instanceof CampaignRequestError) { status = error.status; message = error.message; }
  else if (error instanceof z.ZodError) { status = 400; message = error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" "); }
  else if (error instanceof SyntaxError) { status = 400; message = "Send a valid JSON planning request."; }
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
