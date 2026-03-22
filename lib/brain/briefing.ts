import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import {
  gatherBriefingData,
  insertBriefing,
  insertPendingAction,
  updateThoughtUrgency,
  queryPermissionOverrides,
  queryEdgesByThought,
  queryFailedActions,
  type ThoughtRecord,
  type AlertItem,
  type EdgeRecord,
} from "./queries";
import { calculateUrgencyScore, isForceResolution, isSnoozed } from "./urgency";
import { classifyTasks, type TaskClassification } from "./classifier";
import { getPermissionTier } from "./permissions";

const BRIEFING_MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

function formatThoughtCompact(t: ThoughtRecord): string {
  const type = t.thought_type.replace(/_/g, " ");
  const status = t.status !== "active" ? ` [${t.status}]` : "";
  return `- [${type}${status}] ${t.raw_text.slice(0, 200)}`;
}

// ── Urgency Scoring Pass (pure code, no LLM) ──

interface ScoredTask extends ThoughtRecord {
  urgency_score: number;
  age_days: number;
  force_resolution: boolean;
  has_blocking_edge: boolean;
  deadline: string | null;
  snoozed_until: string | null;
}

async function scoreAllTasks(
  tasks: ThoughtRecord[]
): Promise<ScoredTask[]> {
  const scored: ScoredTask[] = [];

  for (const task of tasks) {
    const snoozedUntil = (task as ThoughtRecord & { snoozed_until?: string }).snoozed_until ?? null;
    if (isSnoozed(snoozedUntil)) continue;

    const ageDays = Math.floor(
      (Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check for blocking edges
    let hasBlockingEdge = false;
    try {
      const edges = await queryEdgesByThought(task.id);
      hasBlockingEdge = edges.some((e) => e.edge_type === "blocks");
    } catch {
      // Non-critical — skip edge check
    }

    const deadline = (task as ThoughtRecord & { deadline?: string }).deadline ?? null;

    const score = calculateUrgencyScore({
      thought_type: task.thought_type,
      age_days: ageDays,
      people: task.people ?? [],
      has_blocking_edge: hasBlockingEdge,
      referenced_in_briefing: false,
      action_items: task.action_items ?? [],
      deadline,
    });

    // Update the score in the database
    await updateThoughtUrgency(task.id, score);

    scored.push({
      ...task,
      urgency_score: score,
      age_days: ageDays,
      force_resolution: isForceResolution(ageDays),
      has_blocking_edge: hasBlockingEdge,
      deadline,
      snoozed_until: snoozedUntil,
    });
  }

  // Sort by deadline priority first, then by urgency score
  return scored.sort((a, b) => {
    // Deadline tasks with deadline < 48h always sort first
    const aDeadlineSoon = a.deadline && (new Date(a.deadline).getTime() - Date.now()) < 48 * 60 * 60 * 1000;
    const bDeadlineSoon = b.deadline && (new Date(b.deadline).getTime() - Date.now()) < 48 * 60 * 60 * 1000;
    if (aDeadlineSoon && !bDeadlineSoon) return -1;
    if (!aDeadlineSoon && bDeadlineSoon) return 1;
    return b.urgency_score - a.urgency_score;
  });
}

// ── Action Planning ──

async function planActions(
  classifications: TaskClassification[],
  briefingId: string
): Promise<string[]> {
  const actionableIds: string[] = [];
  const MAX_ACTIONS = 3;

  const actionable = classifications.filter(
    (c) =>
      c.action_classification === "auto_actionable" ||
      c.action_classification === "draft_needed"
  );

  for (const cls of actionable.slice(0, MAX_ACTIONS)) {
    try {
      const action = await insertPendingAction({
        thoughtId: cls.thought_id,
        briefingId,
        actionType: cls.action_type,
        permissionTier: cls.permission_tier,
        stakes: cls.stakes,
        promptSummary: cls.prompt_summary,
        urgencyScore: 0, // Will be set from the thought
      });
      actionableIds.push(action.id);
    } catch (err) {
      // Unique constraint violation = action already exists for this thought
      console.warn(`Action planning skipped for ${cls.thought_id}:`, err);
    }
  }

  return actionableIds;
}

// ── Briefing Prompt Builder ──

function buildBriefingPrompt(
  data: {
    recentThoughts: ThoughtRecord[];
    openTasks: ThoughtRecord[];
    staleTasks: ThoughtRecord[];
    unactedDecisions: ThoughtRecord[];
    dormantIdeas: ThoughtRecord[];
    projectSummaries: { slug: string; name: string; thought_count: number }[];
    alerts: AlertItem[];
    newEdges: EdgeRecord[];
  },
  scoredTasks: ScoredTask[],
  classifications: TaskClassification[],
  failedActions: { thought_id: string; failure_reason: string | null }[]
): string {
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

  // Forced resolution tasks (21+ days)
  const forceResolution = scoredTasks.filter((t) => t.force_resolution);
  if (forceResolution.length) {
    sections.push(`## OVERDUE — MUST RESOLVE (${forceResolution.length})`);
    for (const t of forceResolution) {
      sections.push(`- [${t.age_days}d old, score: ${t.urgency_score}] ${t.raw_text.slice(0, 200)} (ID: ${t.id})`);
      sections.push(`  → Complete it, snooze it, or delete it. Pick one.`);
    }
    sections.push("");
  }

  // Scored tasks by urgency (top 10)
  if (scoredTasks.length) {
    sections.push(`## Tasks by Urgency (top 10 of ${scoredTasks.length})`);
    for (const t of scoredTasks.slice(0, 10)) {
      const deadline = t.deadline ? ` | deadline: ${t.deadline}` : "";
      const blocking = t.has_blocking_edge ? " | BLOCKS other tasks" : "";
      sections.push(`- [score: ${t.urgency_score}, ${t.age_days}d old${deadline}${blocking}] ${t.raw_text.slice(0, 150)} (ID: ${t.id})`);
    }
    sections.push("");
  }

  // Classifications — what the agent plans to do
  const planned = classifications.filter(
    (c) => c.action_classification === "auto_actionable" || c.action_classification === "draft_needed"
  );
  if (planned.length) {
    sections.push(`## Actions Staged (${planned.length})`);
    for (const c of planned) {
      const tierLabel = c.permission_tier === "auto" ? "auto-execute" : "needs your approval";
      sections.push(`- [${c.action_type}, ${tierLabel}, ${c.model_recommendation}] ${c.prompt_summary} (thought: ${c.thought_id})`);
    }
    sections.push("");
  }

  // Quick wins
  const quickWins = classifications.filter((c) => c.action_classification === "quick_win");
  if (quickWins.length) {
    sections.push(`## Quick Wins — knock these out`);
    for (const c of quickWins) {
      sections.push(`- ${c.prompt_summary} (ID: ${c.thought_id})`);
    }
    sections.push("");
  }

  // Failed actions from previous cycle
  if (failedActions.length) {
    sections.push(`## Failed Actions (previous cycle)`);
    for (const f of failedActions) {
      sections.push(`- Thought ${f.thought_id}: ${f.failure_reason ?? "unknown"}`);
    }
    sections.push("");
  }

  // Stale tasks
  if (data.staleTasks.length) {
    sections.push(`## Stale Tasks — Friction Signal (${data.staleTasks.length})`);
    for (const t of data.staleTasks) {
      const days = (t as ThoughtRecord & { days_stale?: number }).days_stale ?? "?";
      sections.push(`- [${t.status}, ${days}d stale] ${t.raw_text.slice(0, 200)} (ID: ${t.id})`);
    }
    sections.push("");
  }

  // Unacted decisions
  if (data.unactedDecisions.length) {
    sections.push(`## Recent Decisions (last 14d) — check for follow-through`);
    for (const t of data.unactedDecisions) {
      sections.push(formatThoughtCompact(t));
    }
    sections.push("");
  }

  // Dormant ideas
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

const BRIEFING_SYSTEM_PROMPT = `You are Shawn Petros's strategic advisor — an intelligence analyst for his personal knowledge graph (second brain). You see everything he's working on across all projects, and your job is to surface what he's MISSING, not recap what he already knows.

Shawn is a staff-level engineer running multiple projects simultaneously. He does not need a summary of what he shipped. He needs to see: friction, dropped threads, inefficiencies, pain patterns, and opportunities he's too close to notice.

PRODUCE THIS FORMAT:

## Morning Briefing — {today's date}

### Overdue & Forced Resolution
Tasks that have exceeded 21 days without action. These MUST be resolved today — complete, snooze, or delete. No deferral.

### Friction & Pain Points
What's causing repeated rework, blocking progress, or generating the most noise without resolution?

### Actions Staged
What the autonomous agent is working on right now. List what was auto-executed and what needs approval. If actions failed from the previous cycle, explain why and whether they'll be retried.

### Quick Wins
Tasks under 5 minutes of effort — knock these out between meetings.

### Dropped Threads
What was started or discussed but has gone quiet?

### Priority Actions
Numbered list (max 5) of the highest-leverage things to do today. Factor in urgency scores and deadlines.

### Pattern Intelligence
Cross-project patterns, emerging themes, or connections between thoughts that might not be obvious.

RULES:
- Be direct and blunt. This is an intelligence brief, not a newsletter.
- Never lead with celebration. Start with problems.
- Refer to projects by slug. Include thought IDs when referencing specific items.
- If an alert is aging, say exactly how many days and what the cost of inaction is.
- If there's genuinely nothing to flag, say "Clean slate" and stop.
- Under 600 words total.`;

// ── Main Pipeline ──

export interface BriefingResult {
  id: string;
  content: string;
  cost: number;
  tokens: number;
  thoughtCount: number;
  plannedActionIds: string[];
  classifications: TaskClassification[];
}

export async function generateBriefing(): Promise<BriefingResult> {
  // 1. Gather all brain data
  const data = await gatherBriefingData();
  const thoughtCount = data.recentThoughts.length;

  // 2. Score urgency on all open tasks (pure code, no LLM)
  const scoredTasks = await scoreAllTasks(data.openTasks);

  // 3. Check for failed actions from previous cycle
  const failedActions = await queryFailedActions(5);

  // 4. Classify top 10 tasks with Sonnet
  const overrides = await queryPermissionOverrides();
  let classifications: TaskClassification[] = [];
  if (scoredTasks.length > 0) {
    try {
      classifications = await classifyTasks(
        scoredTasks.slice(0, 10).map((t) => ({
          ...t,
          has_blocking_edge: t.has_blocking_edge,
        })),
        overrides
      );

      // Update classifications in the database
      for (const cls of classifications) {
        await updateThoughtUrgency(
          cls.thought_id,
          scoredTasks.find((t) => t.id === cls.thought_id)?.urgency_score ?? 0,
          cls.action_classification
        );
      }
    } catch (err) {
      console.error("Task classification failed:", err);
      // Continue without classifications — briefing still works
    }
  }

  // 5. Build enriched context for briefing prompt
  const context = buildBriefingPrompt(
    data,
    scoredTasks,
    classifications,
    failedActions.map((a) => ({
      thought_id: a.thought_id,
      failure_reason: a.failure_reason,
    }))
  );

  // 6. Generate briefing with Sonnet
  let content: string;
  let tokens: number;
  let cost: number;

  if (!data.recentThoughts.length && !data.alerts.length && scoredTasks.length === 0) {
    content = "## Morning Briefing\n\nQuiet day — no new thoughts captured in the last 24h. No alerts. No open tasks.\n\nConsider reviewing your goals or capturing some reflections.";
    tokens = 0;
    cost = 0;
  } else {
    const response = await getClient().messages.create({
      model: BRIEFING_MODEL,
      max_tokens: 1500,
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: context }],
    });

    content = response.content[0].type === "text"
      ? response.content[0].text
      : "Failed to generate briefing.";
    tokens = response.usage.input_tokens + response.usage.output_tokens;
    // Sonnet 4.6: $3/M input, $15/M output
    cost =
      (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) /
      1_000_000;
  }

  // 7. Store briefing in Postgres
  const record = await insertBriefing({
    content,
    rawData: {
      recentThoughts: data.recentThoughts.length,
      openTasks: data.openTasks.length,
      scoredTasks: scoredTasks.length,
      classifications: classifications.length,
      projectsActive: data.projectSummaries.length,
      alerts: data.alerts.length,
      newEdges: data.newEdges.length,
      failedActionsRetried: failedActions.length,
    },
    model: BRIEFING_MODEL,
    costUsd: cost,
    tokensUsed: tokens,
    thoughtCount,
  });

  // 8. Plan actions for top 3 actionable tasks
  let plannedActionIds: string[] = [];
  if (classifications.length > 0) {
    try {
      plannedActionIds = await planActions(classifications, record.id);
    } catch (err) {
      console.error("Action planning failed:", err);
    }
  }

  return {
    id: record.id,
    content,
    cost,
    tokens,
    thoughtCount,
    plannedActionIds,
    classifications,
  };
}
