import { NextRequest } from "next/server";
import { Client } from "@upstash/qstash";

/**
 * Cron endpoint — triggered by Vercel Cron (vercel.json).
 * Verifies CRON_SECRET, then publishes a QStash message
 * to /api/briefing/generate for reliable async execution.
 *
 * Fallback: if no QSTASH_TOKEN, calls generate directly.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const qstashToken = process.env.QSTASH_TOKEN;
  const baseUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

  if (qstashToken) {
    // Publish to QStash for reliable async execution
    const qstash = new Client({ token: qstashToken });
    await qstash.publishJSON({
      url: `${baseUrl}/api/briefing/generate`,
      headers: {
        "x-briefing-secret": process.env.BRAIN_API_KEY ?? "",
      },
      body: { trigger: "cron" },
      retries: 2,
      timeout: 60,
    });

    return Response.json({ status: "queued", via: "qstash" });
  }

  // Fallback: call generate directly (for dev or if no QStash)
  try {
    const res = await fetch(`${baseUrl}/api/briefing/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-briefing-secret": process.env.BRAIN_API_KEY ?? "",
      },
      body: JSON.stringify({ trigger: "cron-direct" }),
    });

    const result = await res.json();
    return Response.json({ status: "generated", ...result });
  } catch (err) {
    return Response.json(
      { error: "Failed to generate briefing", details: String(err) },
      { status: 500 }
    );
  }
}
