import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import {
  ACTION_TYPE_ALLOWLIST,
  getPermissionTier,
} from "@/lib/brain/permissions";
import type { ThoughtRecord } from "@/lib/brain/queries";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

const CLASSIFIER_MODEL = "claude-sonnet-4-6-20250514";

export interface TaskClassification {
  thought_id: string;
  action_classification:
    | "auto_actionable"
    | "draft_needed"
    | "human_only"
    | "quick_win";
  action_type: string;
  permission_tier: "auto" | "staged" | "never";
  prompt_summary: string;
  model_recommendation: "sonnet" | "opus";
  stakes: "low" | "medium" | "high";
}

const SYSTEM_PROMPT = `You are a task classification assistant for an autonomous action queue. You evaluate tasks and determine what an AI agent can do with them.

You MUST respond with ONLY valid JSON — an array of classification objects.

Each object must have:
{
  "thought_id": "the UUID from the input",
  "action_classification": one of ["auto_actionable", "draft_needed", "human_only", "quick_win"],
  "action_type": one of [${ACTION_TYPE_ALLOWLIST.map((t) => `"${t}"`).join(", ")}],
  "prompt_summary": "what the agent should do — a clear, actionable instruction",
  "model_recommendation": "sonnet" or "opus",
  "stakes": "low", "medium", or "high"
}

Classification rules:
- "auto_actionable": Agent can fully complete this without human input. Examples: research a person/company, summarize findings, analyze options, categorize data.
- "draft_needed": Agent can produce output that needs human review before delivery. Examples: draft an email, write a message, create content, make a recommendation.
- "human_only": Requires physical action, a phone call, a real-world decision, or actions the agent cannot perform. Examples: schedule an appointment, make a purchase, attend a meeting, have a conversation.
- "quick_win": Simple task that takes under 5 minutes of human effort. Agent can't do it, but it should be surfaced as "knock this out."

action_type rules:
- ONLY use types from the allowlist above. If a task doesn't fit any type, use the closest match.
- "research" for looking up people, companies, topics
- "summary" for synthesizing existing information
- "analysis" for comparing options or evaluating trade-offs
- "draft_email" for writing emails
- "draft_message" for writing messages (Slack, text, etc.)
- "draft_content" for writing posts, articles, proposals
- "draft_report" for writing reports or client deliverables
- "recommendation" for making suggestions based on analysis
- "schedule" for anything requiring calendar/appointment actions (always human_only)

model_recommendation rules:
- "opus" for high-stakes drafts involving medical, legal, financial, or compliance topics
- "opus" for drafts that require nuanced tone (complaints, negotiations, sensitive communications)
- "sonnet" for everything else

stakes rules:
- "high" for medical, legal, financial, career-critical, or relationship-sensitive tasks
- "medium" for client work, professional communications, or decisions with moderate consequences
- "low" for research, organization, content creation, or internal notes`;

export async function classifyTasks(
  tasks: (ThoughtRecord & {
    urgency_score?: number;
    deadline?: string | null;
    has_blocking_edge?: boolean;
  })[],
  overrides?: Record<string, string>
): Promise<TaskClassification[]> {
  if (tasks.length === 0) return [];

  const taskDescriptions = tasks.map((t, i) => {
    const parts = [
      `Task ${i + 1}:`,
      `  ID: ${t.id}`,
      `  Text: ${t.raw_text}`,
      `  Type: ${t.thought_type}`,
      `  Status: ${t.status}`,
      `  People: ${t.people?.join(", ") || "none"}`,
      `  Topics: ${t.topics?.join(", ") || "none"}`,
      `  Action items: ${t.action_items?.join("; ") || "none"}`,
    ];
    if (t.urgency_score) parts.push(`  Urgency score: ${t.urgency_score}`);
    if (t.deadline) parts.push(`  Deadline: ${t.deadline}`);
    if (t.has_blocking_edge) parts.push(`  Blocks other tasks: yes`);
    return parts.join("\n");
  });

  const response = await getClient().messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Classify these ${tasks.length} tasks:\n\n${taskDescriptions.join("\n\n")}`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("Classifier returned non-JSON:", text);
    return [];
  }

  const parsed: Array<{
    thought_id: string;
    action_classification: string;
    action_type: string;
    prompt_summary: string;
    model_recommendation: string;
    stakes: string;
  }> = JSON.parse(jsonMatch[0]);

  // Validate and attach permission tiers from code (not from the model)
  return parsed.map((item) => {
    const actionType = ACTION_TYPE_ALLOWLIST.includes(item.action_type)
      ? item.action_type
      : "research"; // safe fallback

    return {
      thought_id: item.thought_id,
      action_classification: item.action_classification as TaskClassification["action_classification"],
      action_type: actionType,
      permission_tier: getPermissionTier(actionType, overrides),
      prompt_summary: item.prompt_summary,
      model_recommendation: item.model_recommendation as "sonnet" | "opus",
      stakes: (item.stakes as "low" | "medium" | "high") || "low",
    };
  });
}

export function getClassifierCost(response: { usage?: { input_tokens: number; output_tokens: number } }): number {
  if (!response.usage) return 0;
  // Sonnet 4.6: $3/M input, $15/M output
  return (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000;
}
