import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryBriefings, queryLatestBriefing } from "@/lib/brain/queries";

export async function GET(req: NextRequest) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const latest = req.nextUrl.searchParams.get("latest");
  if (latest === "true") {
    const briefing = await queryLatestBriefing();
    return NextResponse.json(briefing ?? { content: "No briefings yet." });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 10;
  const briefings = await queryBriefings(limit);
  return NextResponse.json(briefings);
}
