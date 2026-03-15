import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryAlerts } from "@/lib/brain/queries";

export async function GET() {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const alerts = await queryAlerts();
  return NextResponse.json(alerts);
}
