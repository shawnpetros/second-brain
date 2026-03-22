import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import {
  queryPendingActionById,
  insertPendingAction,
} from "@/lib/brain/queries";

/**
 * POST /api/brain/actions/[id]/retry — re-trigger a failed or rejected action
 * Body: { note?: string } — optional user guidance appended to the prompt
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { id } = await params;
  const body = await req.json();
  const note = body.note as string | undefined;

  const original = await queryPendingActionById(id);
  if (!original) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["failed", "rejected", "abandoned"].includes(original.status)) {
    return NextResponse.json(
      { error: `Cannot retry action with status: ${original.status}` },
      { status: 422 }
    );
  }

  if (original.retry_count >= 2) {
    return NextResponse.json(
      { error: "Max retries (2) reached. This task needs manual attention." },
      { status: 422 }
    );
  }

  // Create a new action linked to the original
  const newAction = await insertPendingAction({
    thoughtId: original.thought_id,
    actionType: original.action_type,
    permissionTier: original.permission_tier as "auto" | "staged" | "never",
    stakes: (original.stakes as "low" | "medium" | "high") ?? undefined,
    promptSummary: note
      ? `${original.prompt_summary}\n\nAdditional guidance: ${note}`
      : original.prompt_summary,
    urgencyScore: original.urgency_score,
  });

  return NextResponse.json({
    id: newAction.id,
    parentActionId: original.id,
    status: newAction.status,
    promptSummary: newAction.prompt_summary,
  });
}
