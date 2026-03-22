import { NextRequest } from "next/server";
import { insertThought } from "@/lib/brain/queries";

export const maxDuration = 30;

/**
 * Lightweight capture endpoint for automated hooks.
 * Auth: BRAIN_API_KEY bearer token (no Clerk needed).
 *
 * Used by: git post-commit hook, Vercel deploy webhook,
 * SessionEnd hook, and any other automation that needs
 * to feed the brain without OAuth.
 */
export async function POST(req: NextRequest) {
  // Verify API key
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  const apiKey = process.env.BRAIN_API_KEY;

  if (!apiKey || !token || token !== apiKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { text, source, thought_type } = body as {
    text?: string;
    source?: string;
    thought_type?: string;
  };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return Response.json({ error: "Missing 'text' field" }, { status: 400 });
  }

  const record = await insertThought(text.trim(), source ?? "hook", thought_type);

  return Response.json({
    id: record.id,
    thought_type: record.thought_type,
    topics: record.topics,
    status: record.status,
  });
}
