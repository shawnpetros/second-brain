import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryStats } from "@/lib/brain/queries";

export async function GET(req: NextRequest) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const days = Number(req.nextUrl.searchParams.get("days")) || 30;
  const stats = await queryStats(days);
  return NextResponse.json(stats);
}
