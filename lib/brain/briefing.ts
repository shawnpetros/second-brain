import OpenAI from "openai";
import { env } from "@/lib/env";
import {
  gatherBriefingData,
  insertBriefing,
  type ThoughtRecord,
  type AlertItem,
  type EdgeRecord,
} from "./queries";

function getClient() {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function formatThoughtCompact(t: ThoughtRecord): string {
  const type = t.thought_type.replace(/_/g, " ");
  const status = t.status !== "active" ? ` [${t.status}]` : "";
  return `- [${type}${status}] ${t.raw_text.slice(0, 200)}`;
}

function buildBriefingPrompt(data: {
  recentThoughts: ThoughtRecord[];
  openTasks: ThoughtRecord[];
  projectSummaries: { slug: string; name: string; thought_count: number }[];
  alerts: AlertItem[];
  newEdges: EdgeRecord[];
}): string {
  const sections: string[] = [];

  // Recent thoughts
  if (data.recentThoughts.length) {
    sections.push("## Recent Activity (last 24h)");
    sections.push(`${data.recentThoughts.length} new thoughts captured.`);
    sections.push("");
    for (const t of data.recentThoughts) {
      sections.push(formatThoughtCompact(t));
    }
    sections.push("");
  }

  // Project activity
  if (data.projectSummaries.length) {
    sections.push("## Project Activity");
    for (const p of data.projectSummaries) {
      sections.push(`- **${p.name}** (${p.slug}): ${p.thought_count} new thoughts`);
    }
    sections.push("");
  }

  // Open tasks
  if (data.openTasks.length) {
    sections.push(`## Open Tasks (${data.openTasks.length})`);
    const untriaged = data.openTasks.filter((t) => t.status === "untriaged");
    const active = data.openTasks.filter((t) => t.status === "active");

    if (untriaged.length) {
      sections.push(`### Untriaged (${untriaged.length})`);
      for (const t of untriaged.slice(0, 10)) sections.push(formatThoughtCompact(t));
    }
    if (active.length) {
      sections.push(`### Active (${active.length})`);
      for (const t of active.slice(0, 10)) sections.push(formatThoughtCompact(t));
    }
    sections.push("");
  }

  // Alerts
  if (data.alerts.length) {
    sections.push(`## Alerts (${data.alerts.length})`);
    for (const a of data.alerts) {
      sections.push(`- **${a.title}**: ${a.description.slice(0, 120)} (${a.age_days}d)`);
    }
    sections.push("");
  }

  // New edges
  if (data.newEdges.length) {
    sections.push(`## New Connections (${data.newEdges.length})`);
    for (const e of data.newEdges) {
      const from = e.from_text?.slice(0, 60) ?? e.from_thought_id;
      const to = e.to_text?.slice(0, 60) ?? e.to_thought_id;
      sections.push(`- [${e.edge_type}] ${from} → ${to}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

export async function generateBriefing(): Promise<{
  id: string;
  content: string;
  cost: number;
  tokens: number;
  thoughtCount: number;
}> {
  // Gather all brain data
  const data = await gatherBriefingData();
  const thoughtCount = data.recentThoughts.length;

  // Build the context
  const context = buildBriefingPrompt(data);

  // If nothing happened, create a minimal briefing
  if (!data.recentThoughts.length && !data.alerts.length) {
    const record = await insertBriefing({
      content: "## Morning Briefing\n\nQuiet day — no new thoughts captured in the last 24h. No alerts.\n\nConsider reviewing your open tasks or capturing some reflections.",
      rawData: { recentThoughts: 0, openTasks: data.openTasks.length, alerts: 0 },
      model: "none",
      costUsd: 0,
      tokensUsed: 0,
      thoughtCount: 0,
    });
    return { id: record.id, content: record.content, cost: 0, tokens: 0, thoughtCount: 0 };
  }

  // Call Claude (via OpenAI-compatible API since we're using gpt-4o-mini for cost)
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are the Morning Briefing synthesizer for Shawn Petros's second brain — a personal knowledge graph.

Your job: analyze the raw brain data below and produce a concise, actionable morning briefing. This is a personal briefing, not a report for others.

FORMAT:
## Morning Briefing — {today's date}

### What Happened
2-3 sentence narrative of yesterday's activity. Mention specific projects and decisions by name.

### Priority Actions
Numbered list (max 5) of the most important things to do today. Pull from untriaged tasks, aging alerts, and any blocking relationships. Be specific — "triage the 3 untriaged tasks from last night" not "review tasks."

### Cross-Project Patterns
If you notice themes across multiple projects (same friction, same person, related decisions), call them out in 1-2 sentences. If none, skip this section.

### Heads Up
Anything that needs attention soon — aging tasks, relationship decay, stale items. If nothing, skip.

RULES:
- Be direct. No pleasantries. Shawn is a staff-level engineer, not a student.
- Refer to projects by their slug name.
- If there's nothing actionable, say so in one line and stop.
- Under 400 words total.`,
      },
      {
        role: "user",
        content: context,
      },
    ],
    max_tokens: 800,
  });

  const content = completion.choices[0]?.message?.content ?? "Failed to generate briefing.";
  const tokens = completion.usage?.total_tokens ?? 0;
  // gpt-4o-mini pricing: $0.15/1M input, $0.60/1M output
  const inputCost = (completion.usage?.prompt_tokens ?? 0) * 0.00000015;
  const outputCost = (completion.usage?.completion_tokens ?? 0) * 0.0000006;
  const cost = inputCost + outputCost;

  // Store in Postgres
  const record = await insertBriefing({
    content,
    rawData: {
      recentThoughts: data.recentThoughts.length,
      openTasks: data.openTasks.length,
      projectsActive: data.projectSummaries.length,
      alerts: data.alerts.length,
      newEdges: data.newEdges.length,
    },
    model: "gpt-4o-mini",
    costUsd: cost,
    tokensUsed: tokens,
    thoughtCount,
  });

  return { id: record.id, content, cost, tokens, thoughtCount };
}
