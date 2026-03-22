import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryPendingActions, queryActionTypeHealth } from "@/lib/brain/queries";

/**
 * GET /api/brain/actions — list pending actions for the approval queue.
 * Query params: status, permissionTier, limit
 */
export async function GET(req: NextRequest) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const params = req.nextUrl.searchParams;
  const actions = await queryPendingActions({
    status: params.get("status") ?? undefined,
    permissionTier: params.get("permissionTier") ?? undefined,
    limit: params.get("limit") ? Number(params.get("limit")) : 20,
  });

  // If health param is set, also return action type health data
  const healthType = params.get("healthType");
  let health = null;
  if (healthType) {
    health = await queryActionTypeHealth(healthType);
  }

  return NextResponse.json({ actions, health });
}
