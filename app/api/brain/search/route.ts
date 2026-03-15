import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { querySemanticSearch } from "@/lib/brain/queries";

export async function GET(req: NextRequest) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const q = req.nextUrl.searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "q parameter is required" }, { status: 400 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 10;
  const results = await querySemanticSearch(q, limit);
  return NextResponse.json(results);
}
