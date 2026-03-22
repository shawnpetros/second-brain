import { NextRequest } from "next/server";
import { executeAction } from "@/lib/brain/executor";

export const maxDuration = 60;

/**
 * Execute a single pending action by ID.
 * Called by QStash (one message per action, parallel dispatch).
 */
export async function POST(req: NextRequest) {
  // Verify auth — accept QStash signature or API key
  const upstashSig = req.headers.get("upstash-signature");
  const secret = req.headers.get("x-briefing-secret");
  const apiKey = process.env.BRAIN_API_KEY;

  if (!upstashSig && (!apiKey || secret !== apiKey)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const actionId = body.actionId;

    if (!actionId) {
      return Response.json({ error: "Missing actionId" }, { status: 400 });
    }

    const result = await executeAction(actionId);

    return Response.json({
      actionId: result.actionId,
      status: result.status,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cost: result.cost,
      durationMs: result.durationMs,
      failureReason: result.failureReason,
    });
  } catch (err) {
    console.error("Action execution failed:", err);
    return Response.json(
      { error: "Execution failed", details: String(err) },
      { status: 500 }
    );
  }
}
