import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryProjects } from "@/lib/brain/queries";

export async function GET() {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const projects = await queryProjects();
  return NextResponse.json(projects);
}
