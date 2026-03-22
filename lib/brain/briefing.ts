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
  staleTasks: ThoughtRecord[];
  unactedDecisions: ThoughtRecord[];
  dormantIdeas: ThoughtRecord[];
  projectSummaries: { slug: string; name: string; thought_count: number }[];
  alerts: AlertItem[];
  newEdges: EdgeRecord[];
}): string {
  const sections: string[] = [];

  // Recent thoughts (context for the LLM)
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

  // Stale / aging tasks — key friction signal
  if (data.staleTasks.length) {
    sections.push(`## STALE TASKS — FRICTION SIGNAL (${data.staleTasks.length})`);
    for (const t of data.staleTasks) {
      const days = (t as ThoughtRecord & { days_stale?: number }).days_stale ?? "?";
      sections.push(`- [${t.status}, ${days}d stale] ${t.raw_text.slice(0, 200)} (ID: ${t.id})`);
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

  // Unacted decisions — things decided but not followed through
  if (data.unactedDecisions.length) {
    sections.push(`## Recent Decisions (last 14d) — check for follow-through`);
    for (const t of data.unactedDecisions) {
      sections.push(formatThoughtCompact(t));
    }
    sections.push("");
  }

  // Dormant ideas — captured but never connected or developed
  if (data.dormantIdeas.length) {
    sections.push(`## Dormant Ideas (7+ days, no edges) — dropped threads?`);
    for (const t of data.dormantIdeas) {
      sections.push(formatThoughtCompact(t));
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
        content: `You are Shawn Petros's strategic advisor — an intelligence analyst for his personal knowledge graph (second brain). You see everything he's working on across all projects, and your job is to surface what he's MISSING, not recap what he already knows.

Shawn is a staff-level engineer running multiple projects simultaneously. He does not need a summary of what he shipped. He needs to see: friction, dropped threads, inefficiencies, pain patterns, and opportunities he's too close to notice.

PRODUCE THIS FORMAT:

## Morning Briefing — {today's date}

### Friction & Pain Points
What's causing repeated rework, blocking progress, or generating the most noise without resolution? Look for:
- Tasks that keep getting deferred (untriaged > 3 days, active > 14 days)
- The same problem appearing in multiple projects
- Decisions that were made but never acted on
- Work that contradicts or duplicates other work

### Dropped Threads
What was started or discussed but has gone quiet? Look for:
- Action items that haven't moved
- People who were mentioned but not followed up with
- Ideas that were captured but never developed
- Blocking relationships with no resolution

### Priority Actions
Numbered list (max 5) of the highest-leverage things to do today. Not busywork — the things that unblock the most, close the most loops, or prevent the most damage. Be specific with project slugs and thought IDs.

### Pattern Intelligence
Cross-project patterns, emerging themes, or connections between thoughts that might not be obvious:
- Same friction showing up in different projects? Call it out.
- An insight from one project that could solve a problem in another?
- Content or research that's relevant to current work but hasn't been connected?
- Recurring topics or people that suggest a relationship worth strengthening?

### Process Improvements
If you notice inefficiencies in how work is being done — rework, manual steps that could be automated, patterns that suggest a tool or process change — surface them. One or two sentences max. Skip if nothing stands out.

RULES:
- Be direct and blunt. This is an intelligence brief, not a newsletter.
- Never lead with "Great work yesterday" or any celebration. Start with problems.
- Refer to projects by slug. Include thought IDs when referencing specific items.
- If an alert is aging, say exactly how many days and what the cost of inaction is.
- If there's genuinely nothing to flag, say "Clean slate" and stop. Don't pad.
- Under 600 words total.`,
      },
      {
        role: "user",
        content: context,
      },
    ],
    max_tokens: 1200,
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
