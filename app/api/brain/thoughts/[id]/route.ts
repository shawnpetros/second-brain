import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryThoughtById, updateThought, removeThought } from "@/lib/brain/queries";

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
  const thought = await queryThoughtById(id);
  if (!thought) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(thought);
}

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
  const updates: { raw_text?: string; status?: string } = {};

  if (body.raw_text && typeof body.raw_text === "string") {
    updates.raw_text = body.raw_text;
  }
  if (body.status && typeof body.status === "string") {
    updates.status = body.status;
  }

  if (!updates.raw_text && !updates.status) {
    return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
  }

  const thought = await updateThought(id, updates);
  if (!thought) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(thought);
}

export async function DELETE(
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
  const deleted = await removeThought(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
