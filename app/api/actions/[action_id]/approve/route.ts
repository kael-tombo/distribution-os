import { z } from "zod";
import { ensureWorkspace, requireRequestIdentity } from "../../../../../db/workspaces";
import {
  approveAction,
  getAction,
  summarizeForDisplay,
} from "../../../../../db/actions";
import { ActionDecisionConflict } from "../../../../../db/action-decisions";

type RouteContext = {
  params: Promise<{ action_id: string }>;
};

const approvalSchema = z.object({
  payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function POST(request: Request, context: RouteContext) {
  try {
    const workspace = await ensureWorkspace(requireRequestIdentity(request));
    const { action_id } = await context.params;

    const action = await getAction(workspace.id, action_id);
    if (!action) {
      return Response.json({ error: "Action not found." }, { status: 404 });
    }
    const input = approvalSchema.parse(await request.json());
    if (input.payload_hash !== action.payload_hash) {
      return Response.json(
        { error: "Approval payload hash does not match the immutable action payload." },
        { status: 409 },
      );
    }

    const updated = await approveAction(workspace.id, action_id, workspace.owner_user_id, input.payload_hash);

    return Response.json({ action: summarizeForDisplay(updated) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in to approve actions." }, { status: 401 });
    }
    if (error instanceof ActionDecisionConflict) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Approval requires the exact reviewed payload hash." }, { status: 400 });
    }
    return Response.json(
      { error: "Action could not be approved. Refresh its state before retrying." },
      { status: 500 }
    );
  }
}
