import { z } from "zod";
import { ensureWorkspace, requireRequestIdentity } from "../../../../../db/workspaces";
import {
  getAction,
  rejectAction,
  summarizeForDisplay,
} from "../../../../../db/actions";
import { ActionDecisionConflict } from "../../../../../db/action-decisions";

const rejectSchema = z.object({
  blocker: z.string().trim().max(500).optional(),
});

type RouteContext = {
  params: Promise<{ action_id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const workspace = await ensureWorkspace(requireRequestIdentity(request));
    const { action_id } = await context.params;

    const action = await getAction(workspace.id, action_id);
    if (!action) {
      return Response.json({ error: "Action not found." }, { status: 404 });
    }

    const input = rejectSchema.parse(await request.json().catch(() => ({})));

    const updated = await rejectAction(workspace.id, action_id, workspace.owner_user_id, input.blocker);

    return Response.json({ action: summarizeForDisplay(updated) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in to reject actions." }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid rejection request." }, { status: 400 });
    }
    if (error instanceof ActionDecisionConflict) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: "Action could not be rejected. Refresh its state before retrying." },
      { status: 500 }
    );
  }
}
