import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { snoozeTask } from "@/lib/brain/queries";

/**
 * PATCH /api/brain/thoughts/[id]/snooze — snooze a task for 2, 5, or 7 days
 * Body: { days: 2 | 5 | 7 }
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
  const days = body.days as number;

  if (![2, 5, 7].includes(days)) {
    return NextResponse.json(
      { error: "days must be 2, 5, or 7" },
      { status: 400 }
    );
  }

  const result = await snoozeTask(id, days as 2 | 5 | 7);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result);
}
