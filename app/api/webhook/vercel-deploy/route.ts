import { NextRequest } from "next/server";
import { insertThought } from "@/lib/brain/queries";

/**
 * Vercel Deploy Webhook — auto-captures production deploys as milestones.
 *
 * Configure in Vercel Dashboard → Settings → Webhooks:
 * URL: https://second-brain.shawnpetros.com/api/webhook/vercel-deploy
 * Events: deployment.succeeded
 * Secret: BRAIN_API_KEY value
 *
 * Vercel signs webhooks — we verify via the secret.
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret (Vercel sends as query param or header)
  const secret = req.nextUrl.searchParams.get("secret");
  const apiKey = process.env.BRAIN_API_KEY;

  if (!apiKey || secret !== apiKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Only capture production deploys that succeeded
  const target = body.payload?.deployment?.meta?.githubCommitRef
    ?? body.payload?.target
    ?? body.target;
  const state = body.payload?.deployment?.state ?? body.type;

  // Filter: only production deploys
  if (target !== "main" && body.payload?.target !== "production") {
    return Response.json({ skipped: "not production" });
  }

  // Extract deploy info
  const project =
    body.payload?.deployment?.name
    ?? body.payload?.name
    ?? "unknown-project";
  const commitMessage =
    body.payload?.deployment?.meta?.githubCommitMessage
    ?? body.payload?.meta?.githubCommitMessage
    ?? "";
  const commitSha =
    body.payload?.deployment?.meta?.githubCommitSha?.slice(0, 7)
    ?? "";
  const url =
    body.payload?.deployment?.url
    ?? body.payload?.url
    ?? "";

  const text = `DEPLOY (${project}): Production deploy succeeded.
Commit: ${commitMessage.split("\n")[0]}
SHA: ${commitSha}
URL: https://${url}`;

  await insertThought(text.trim(), "vercel-webhook", "milestone");

  return Response.json({ captured: true, project });
}
