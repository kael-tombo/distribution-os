import { z } from "zod";
import { getRawDb } from "../../../db";
import { ensureWorkspace, requireRequestIdentity } from "../../../db/workspaces";
import { BriefConflict, listBriefRevisions, saveBrief } from "../../../db/campaign-briefs";
import { saveBriefSchema } from "../../../lib/campaign-brief";

function failure(error: unknown) {
  if (error instanceof Error && error.message === "AUTH_REQUIRED") {
    return Response.json({ error: "Sign in to open your campaign brief." }, { status: 401 });
  }
  if (error instanceof BriefConflict) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return Response.json({ error: "Enter a product, objective, audience, success measure and at least one channel. Check field length limits." }, { status: 400 });
  }
  return Response.json({ error: "The campaign brief is unavailable. Please try again." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const workspace = await ensureWorkspace(requireRequestIdentity(request));
    const revisions = await listBriefRevisions(getRawDb(), workspace.id);
    return Response.json({ current: revisions[0] ?? null, revisions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    const identity = requireRequestIdentity(request);
    const workspace = await ensureWorkspace(identity);
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 40_000) {
      return Response.json({ error: "This brief is too large." }, { status: 413 });
    }
    const input = saveBriefSchema.parse(JSON.parse(body));
    const current = await saveBrief(getRawDb(), workspace.id, identity.userId, input.expected_revision, input.brief);
    return Response.json({ current }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
