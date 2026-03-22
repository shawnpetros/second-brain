import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { selectModel, type ActionContext } from "@/lib/brain/permissions";
import {
  queryPendingActionById,
  updatePendingActionStatus,
  queryThoughtById,
  type PendingActionRecord,
} from "@/lib/brain/queries";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

const PROMPT_TEMPLATES: Record<string, (summary: string, context: string) => string> = {
  research: (summary, context) =>
    `You are a research assistant. ${summary}\n\nContext from the original task:\n${context}\n\nProvide a structured research summary with:\n- Background/overview\n- Key findings (bulleted)\n- Relevance to the user's situation\n- Recommended next steps\n\nBe thorough but concise. Cite specific facts and details.`,

  summary: (summary, context) =>
    `You are a synthesis assistant. ${summary}\n\nSource material:\n${context}\n\nProvide a clear, structured summary with key takeaways and actionable insights.`,

  analysis: (summary, context) =>
    `You are an analytical assistant. ${summary}\n\nContext:\n${context}\n\nProvide a structured analysis with:\n- Key factors to consider\n- Trade-offs between options\n- A clear recommendation with rationale`,

  draft_email: (summary, context) =>
    `You are a professional communication assistant. ${summary}\n\nContext and background:\n${context}\n\nDraft a complete, ready-to-send email. Include:\n- Subject line\n- Full email body\n- Appropriate tone for the situation\n- Specific facts and arguments from the context\n\nThe email should be assertive but professional. Do not use filler or generic language.`,

  draft_message: (summary, context) =>
    `You are a communication assistant. ${summary}\n\nContext:\n${context}\n\nDraft a concise, ready-to-send message appropriate for the platform.`,

  draft_content: (summary, context) =>
    `You are a content creation assistant. ${summary}\n\nContext and background:\n${context}\n\nDraft polished, publication-ready content with the user's voice and perspective.`,

  draft_report: (summary, context) =>
    `You are a report writing assistant. ${summary}\n\nContext:\n${context}\n\nProduce a structured, professional report with clear sections, data-driven insights, and actionable recommendations.`,

  recommendation: (summary, context) =>
    `You are a strategic advisor. ${summary}\n\nContext:\n${context}\n\nProvide a clear recommendation with:\n- Your recommendation (lead with it)\n- Supporting rationale\n- Risks and mitigations\n- Alternative options considered`,

  categorize: (summary, context) =>
    `You are an organization assistant. ${summary}\n\nItems to categorize:\n${context}\n\nProvide a structured categorization with clear groupings and reasoning.`,

  internal_note: (summary, context) =>
    `You are a note-taking assistant. ${summary}\n\nContext:\n${context}\n\nWrite a clear, concise internal note capturing the key information.`,
};

function getDefaultPrompt(summary: string, context: string): string {
  return `${summary}\n\nContext:\n${context}\n\nProvide a thorough, actionable response.`;
}

export interface ExecutionResult {
  actionId: string;
  status: "staged" | "failed";
  result?: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  durationMs: number;
  failureReason?: string;
}

export async function executeAction(actionId: string): Promise<ExecutionResult> {
  const start = Date.now();

  const action = await queryPendingActionById(actionId);
  if (!action) {
    return {
      actionId,
      status: "failed",
      model: "none",
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      durationMs: Date.now() - start,
      failureReason: "action_not_found",
    };
  }

  // Guard: only execute planned actions
  if (action.status !== "planned") {
    return {
      actionId,
      status: "failed",
      model: "none",
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      durationMs: Date.now() - start,
      failureReason: `invalid_status:${action.status}`,
    };
  }

  // Guard: never execute 'never' tier actions
  if (action.permission_tier === "never") {
    await updatePendingActionStatus(actionId, "blocked");
    return {
      actionId,
      status: "failed",
      model: "none",
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      durationMs: Date.now() - start,
      failureReason: "permission_tier_never",
    };
  }

  // Mark as executing
  await updatePendingActionStatus(actionId, "executing");

  // Load source thought for context
  const thought = await queryThoughtById(action.thought_id);
  const context = thought
    ? [
        thought.raw_text,
        thought.people?.length ? `People: ${thought.people.join(", ")}` : "",
        thought.topics?.length ? `Topics: ${thought.topics.join(", ")}` : "",
        thought.action_items?.length ? `Action items:\n${thought.action_items.map((a) => `- ${a}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : action.prompt_summary;

  // Select model based on permission tier and stakes
  const actionContext: ActionContext = {
    action: {
      action_type: action.action_type,
      stakes: (action.stakes as "low" | "medium" | "high") || "low",
      permission_tier: action.permission_tier as "auto" | "staged" | "never",
    },
    sourceThought: { topics: thought?.topics },
  };
  const model = action.model_used || selectModel(actionContext);

  // Build prompt with adjustments
  const templateFn = PROMPT_TEMPLATES[action.action_type] || getDefaultPrompt;
  let prompt = templateFn(action.prompt_summary, context);
  if (action.prompt_adjustments) {
    prompt += `\n\nAdditional instructions: ${action.prompt_adjustments}`;
  }

  try {
    const response = await getClient().messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const resultText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Basic quality check
    const isLowQuality =
      resultText.length < 100 ||
      /^(I can't|I'm unable|I cannot|I don't have)/i.test(resultText);

    if (isLowQuality) {
      const durationMs = Date.now() - start;
      await updatePendingActionStatus(actionId, "failed", {
        result: resultText,
        modelUsed: model,
        failureReason: "low_quality",
        resultMetadata: {
          tokens_in: response.usage.input_tokens,
          tokens_out: response.usage.output_tokens,
          cost: computeCost(model, response.usage),
          duration_ms: durationMs,
        },
      });
      return {
        actionId,
        status: "failed",
        result: resultText,
        model,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
        cost: computeCost(model, response.usage),
        durationMs,
        failureReason: "low_quality",
      };
    }

    // Success — mark as staged
    const durationMs = Date.now() - start;
    const cost = computeCost(model, response.usage);
    await updatePendingActionStatus(actionId, "staged", {
      result: resultText,
      modelUsed: model,
      resultMetadata: {
        tokens_in: response.usage.input_tokens,
        tokens_out: response.usage.output_tokens,
        cost,
        duration_ms: durationMs,
      },
    });

    return {
      actionId,
      status: "staged",
      result: resultText,
      model,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      cost,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const reason = error instanceof Error ? error.message : "unknown_error";

    await updatePendingActionStatus(actionId, "failed", {
      failureReason: reason,
      modelUsed: model,
    });

    return {
      actionId,
      status: "failed",
      model,
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      durationMs,
      failureReason: reason,
    };
  }
}

function computeCost(
  model: string,
  usage: { input_tokens: number; output_tokens: number }
): number {
  // Pricing per million tokens
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-opus-4-6": { input: 5, output: 25 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
  };
  const rates = pricing[model] ?? pricing["claude-sonnet-4-6"];
  return (
    (usage.input_tokens * rates.input + usage.output_tokens * rates.output) /
    1_000_000
  );
}
