import { NextRequest } from "next/server";
import {
  queryProjectByRepoPath,
  queryProjectContext,
} from "@/lib/brain/queries";

/**
 * Hook endpoint for Claude Code SessionStart.
 * Accepts repo path, returns project context as plain text markdown.
 * Auth: BRAIN_API_KEY bearer token (lightweight, no Clerk needed).
 */
export async function GET(req: NextRequest) {
  // Verify API key
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  const apiKey = process.env.BRAIN_API_KEY;

  if (!apiKey || !token || token !== apiKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return new Response("Missing path parameter", { status: 400 });
  }

  // Look up project by repo path
  const project = await queryProjectByRepoPath(path);
  if (!project) {
    return new Response("", { status: 200 }); // No project found — empty response, not an error
  }

  // Get full context
  const ctx = await queryProjectContext(project.slug);
  if (!ctx) {
    return new Response("", { status: 200 });
  }

  // Format as markdown for Claude's context window
  const parts: string[] = [
    `## ${ctx.project.name} — Brain Context`,
    "",
  ];

  if (ctx.lastMilestone) {
    const date = new Date(ctx.lastMilestone.created_at).toISOString().slice(0, 10);
    parts.push(`**Last milestone** (${date}): ${ctx.lastMilestone.raw_text.slice(0, 200)}`);
    parts.push("");
  }

  if (ctx.openTasks.length) {
    parts.push(`**Open tasks (${ctx.openTasks.length}):**`);
    for (const t of ctx.openTasks) {
      const status = t.status === "untriaged" ? "untriaged" : "active";
      parts.push(`- [${status}] ${t.raw_text.slice(0, 150)}`);
    }
    parts.push("");
  }

  if (ctx.recentDecisions.length) {
    parts.push(`**Recent decisions (${ctx.recentDecisions.length}):**`);
    for (const t of ctx.recentDecisions) {
      parts.push(`- ${t.raw_text.slice(0, 150)}`);
    }
    parts.push("");
  }

  if (ctx.recentInsights.length) {
    parts.push(`**Recent insights (${ctx.recentInsights.length}):**`);
    for (const t of ctx.recentInsights) {
      parts.push(`- ${t.raw_text.slice(0, 150)}`);
    }
    parts.push("");
  }

  if (ctx.blockingEdges.length) {
    parts.push(`**Blocking relationships (${ctx.blockingEdges.length}):**`);
    for (const e of ctx.blockingEdges) {
      const from = e.from_text?.slice(0, 80) ?? e.from_thought_id;
      const to = e.to_text?.slice(0, 80) ?? e.to_thought_id;
      parts.push(`- ${from} → blocks → ${to}`);
    }
    parts.push("");
  }

  return new Response(parts.join("\n"), {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
