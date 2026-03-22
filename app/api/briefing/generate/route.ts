import { NextRequest } from "next/server";
import { generateBriefing } from "@/lib/brain/briefing";

export const maxDuration = 60; // Allow up to 60s for Claude API call

/**
 * Generate endpoint — called by QStash (or directly by cron fallback).
 * Gathers brain data, calls Claude to synthesize, stores in Postgres.
 */
export async function POST(req: NextRequest) {
  // Verify briefing secret (prevents unauthorized triggers)
  const secret = req.headers.get("x-briefing-secret");
  const apiKey = process.env.BRAIN_API_KEY;

  // Also check for Upstash-Signature if coming from QStash
  const upstashSig = req.headers.get("upstash-signature");

  if (!upstashSig && (!apiKey || secret !== apiKey)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateBriefing();

    return Response.json({
      id: result.id,
      thoughtCount: result.thoughtCount,
      tokens: result.tokens,
      cost: result.cost,
    });
  } catch (err) {
    console.error("Briefing generation failed:", err);
    return Response.json(
      { error: "Failed to generate briefing", details: String(err) },
      { status: 500 }
    );
  }
}
