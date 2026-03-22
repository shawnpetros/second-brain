import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { insertThought } from "@/lib/brain/queries";

const WEBHOOK_SECRET = process.env.VERCEL_WEBHOOK_SECRET;

/**
 * Vercel Deploy Webhook — auto-captures production deploys as milestones.
 *
 * Vercel signs webhooks with HMAC-SHA1 using the webhook secret.
 * Signature is in the x-vercel-signature header.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify HMAC signature
  if (WEBHOOK_SECRET) {
    const signature = req.headers.get("x-vercel-signature");
    const expected = createHmac("sha1", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (signature !== expected) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const body = JSON.parse(rawBody);

  // Only capture production deploys that succeeded
  const eventType = body.type; // "deployment.succeeded"
  if (eventType !== "deployment.succeeded") {
    return Response.json({ skipped: eventType });
  }

  const target = body.payload?.deployment?.meta?.githubCommitRef
    ?? body.payload?.target;

  // Filter: only production (main branch) deploys
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
    ?? "";
  const commitSha =
    body.payload?.deployment?.meta?.githubCommitSha?.slice(0, 7)
    ?? "";
  const url =
    body.payload?.deployment?.url
    ?? "";

  const text = `DEPLOY (${project}): Production deploy succeeded.
Commit: ${commitMessage.split("\n")[0]}
SHA: ${commitSha}
URL: https://${url}`;

  await insertThought(text.trim(), "vercel-webhook", "milestone");

  return Response.json({ captured: true, project });
}
