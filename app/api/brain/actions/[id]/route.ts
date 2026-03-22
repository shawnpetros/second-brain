import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import {
  queryPendingActionById,
  updatePendingActionStatus,
  flagPendingAction,
} from "@/lib/brain/queries";

/**
 * GET /api/brain/actions/[id] — get a single action with full result
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { id } = await params;
  const action = await queryPendingActionById(id);
  if (!action) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(action);
}

/**
 * PATCH /api/brain/actions/[id] — approve, reject, flag, retry, or dismiss
 * Body: { action: "approve" | "reject" | "flag" | "dismiss", reason?: string }
 */
export async function PATCH(
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
  const { action, reason } = body as {
    action: "approve" | "reject" | "flag" | "dismiss";
    reason?: string;
  };

  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  let result;

  switch (action) {
    case "approve":
      result = await updatePendingActionStatus(id, "approved");
      break;
    case "reject":
      result = await updatePendingActionStatus(id, "rejected");
      break;
    case "dismiss":
      result = await updatePendingActionStatus(id, "dismissed");
      break;
    case "flag":
      result = await flagPendingAction(id, reason);
      break;
    default:
      return NextResponse.json(
        { error: `Invalid action: ${action}` },
        { status: 400 }
      );
  }

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
