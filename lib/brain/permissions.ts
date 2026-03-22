export const PERMISSION_TIERS: Record<string, "auto" | "staged" | "never"> = {
  research: "auto",
  summary: "auto",
  analysis: "auto",
  categorize: "auto",
  internal_note: "auto",
  draft_email: "staged",
  draft_message: "staged",
  draft_content: "staged",
  draft_report: "staged",
  recommendation: "staged",
  send_email: "never",
  send_message: "never",
  financial: "never",
  delete: "never",
  deploy: "never",
  schedule: "never",
  purchase: "never",
  auth: "never",
};

export const ACTION_TYPE_ALLOWLIST = Object.keys(PERMISSION_TIERS);

const SENSITIVE_TOPICS = ["medical", "legal", "financial", "compliance"];

export function getPermissionTier(
  actionType: string,
  overrides?: Record<string, string>
): "auto" | "staged" | "never" {
  const baseTier = PERMISSION_TIERS[actionType] ?? "never";
  if (baseTier === "never") return "never";
  if (baseTier === "auto") return "auto";
  if (overrides && overrides[actionType] === "auto" && baseTier === "staged") {
    return "auto";
  }
  return baseTier;
}

export interface ActionContext {
  action: {
    action_type: string;
    stakes: "low" | "medium" | "high";
    permission_tier: "auto" | "staged" | "never";
  };
  sourceThought: {
    topics?: string[];
  };
}

export function selectModel(ctx: ActionContext): string {
  const { action, sourceThought } = ctx;

  if (action.action_type.startsWith("draft_") && action.stakes === "high") {
    return "claude-opus-4-6";
  }

  const hasSensitiveTopic = sourceThought.topics?.some((t) =>
    SENSITIVE_TOPICS.includes(t.toLowerCase())
  );
  if (hasSensitiveTopic && action.permission_tier === "staged") {
    return "claude-opus-4-6";
  }

  return "claude-sonnet-4-6";
}
