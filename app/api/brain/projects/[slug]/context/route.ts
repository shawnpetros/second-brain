import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryProjectContext } from "@/lib/brain/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { slug } = await params;
  const context = await queryProjectContext(slug);

  if (!context) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(context);
}
