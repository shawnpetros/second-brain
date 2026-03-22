import { NextRequest } from "next/server";
import { Client } from "@upstash/qstash";
import { generateBriefing } from "@/lib/brain/briefing";

export const maxDuration = 60;

/**
 * Generate endpoint — called by QStash (or directly by cron fallback).
 * Enhanced pipeline:
 * 1. Gathers brain data
 * 2. Scores urgency (pure code)
 * 3. Classifies tasks (Sonnet)
 * 4. Generates briefing (Sonnet)
 * 5. Plans actions → inserts pending_actions
 * 6. Dispatches action execution via QStash (parallel, one per action)
 */
export async function POST(req: NextRequest) {
  // Verify briefing secret or QStash signature
  const secret = req.headers.get("x-briefing-secret");
  const apiKey = process.env.BRAIN_API_KEY;
  const upstashSig = req.headers.get("upstash-signature");

  if (!upstashSig && (!apiKey || secret !== apiKey)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateBriefing();

    // Dispatch action execution via QStash (parallel, one per action)
    const qstashToken = process.env.QSTASH_TOKEN;
    const baseUrl =
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000";

    let dispatchedCount = 0;

    if (qstashToken && result.plannedActionIds.length > 0) {
      const qstash = new Client({ token: qstashToken });

      // Dispatch each action as a separate QStash message (parallel execution)
      const dispatches = result.plannedActionIds.map((actionId) =>
        qstash.publishJSON({
          url: `${baseUrl}/api/actions/execute`,
          headers: {
            "x-briefing-secret": apiKey ?? "",
          },
          body: { actionId },
          retries: 3,
          timeout: 60,
        })
      );

      const results = await Promise.allSettled(dispatches);
      dispatchedCount = results.filter((r) => r.status === "fulfilled").length;

      if (dispatchedCount < result.plannedActionIds.length) {
        console.warn(
          `Only dispatched ${dispatchedCount}/${result.plannedActionIds.length} actions`
        );
      }
    }

    return Response.json({
      id: result.id,
      thoughtCount: result.thoughtCount,
      tokens: result.tokens,
      cost: result.cost,
      actionsPlanned: result.plannedActionIds.length,
      actionsDispatched: dispatchedCount,
      classifications: result.classifications.length,
    });
  } catch (err) {
    console.error("Briefing generation failed:", err);
    return Response.json(
      { error: "Failed to generate briefing", details: String(err) },
      { status: 500 }
    );
  }
}
