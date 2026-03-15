import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryThoughts, insertThought } from "@/lib/brain/queries";

export async function GET(req: NextRequest) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const params = req.nextUrl.searchParams;
  const thoughts = await queryThoughts({
    type: params.get("type") ?? undefined,
    topic: params.get("topic") ?? undefined,
    person: params.get("person") ?? undefined,
    status: params.get("status") ?? undefined,
    days: params.get("days") ? Number(params.get("days")) : undefined,
    limit: params.get("limit") ? Number(params.get("limit")) : 50,
    offset: params.get("offset") ? Number(params.get("offset")) : 0,
  });

  return NextResponse.json(thoughts);
}

export async function POST(req: NextRequest) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = await req.json();
  if (!body.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const thought = await insertThought(body.text, body.source ?? "dashboard");
  return NextResponse.json(thought, { status: 201 });
}
