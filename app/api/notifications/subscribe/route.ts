import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { saveSubscription, removeSubscription } from "@/lib/notifications/send";
import { auth } from "@clerk/nextjs/server";

/**
 * POST /api/notifications/subscribe — save a push subscription
 * Body: PushSubscription object from the browser
 */
export async function POST(req: NextRequest) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const subscription = await req.json();

  if (!subscription?.endpoint) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const id = await saveSubscription(userId, subscription);
  return NextResponse.json({ id, status: "subscribed" });
}

/**
 * DELETE /api/notifications/subscribe — remove a push subscription
 * Body: { endpoint: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireDashboardAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = await req.json();
  const removed = await removeSubscription(body.endpoint);

  return NextResponse.json({ removed });
}
