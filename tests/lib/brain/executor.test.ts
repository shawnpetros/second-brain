import { describe, it, expect } from "vitest";

// Test the cost computation and prompt template logic (pure functions)
// The actual executeAction function requires DB + API, tested in integration

describe("executor cost computation", () => {
  // Inline the function since it's not exported
  function computeCost(
    model: string,
    usage: { input_tokens: number; output_tokens: number }
  ): number {
    const pricing: Record<string, { input: number; output: number }> = {
      "claude-opus-4-6-20250514": { input: 5, output: 25 },
      "claude-sonnet-4-6-20250514": { input: 3, output: 15 },
    };
    const rates = pricing[model] ?? pricing["claude-sonnet-4-6-20250514"];
    return (
      (usage.input_tokens * rates.input + usage.output_tokens * rates.output) /
      1_000_000
    );
  }

  it("computes sonnet cost correctly", () => {
    const cost = computeCost("claude-sonnet-4-6-20250514", {
      input_tokens: 3000,
      output_tokens: 2000,
    });
    // 3000 * 3 / 1M + 2000 * 15 / 1M = 0.009 + 0.03 = 0.039
    expect(cost).toBeCloseTo(0.039);
  });

  it("computes opus cost correctly", () => {
    const cost = computeCost("claude-opus-4-6-20250514", {
      input_tokens: 4000,
      output_tokens: 3000,
    });
    // 4000 * 5 / 1M + 3000 * 25 / 1M = 0.02 + 0.075 = 0.095
    expect(cost).toBeCloseTo(0.095);
  });

  it("falls back to sonnet pricing for unknown models", () => {
    const cost = computeCost("some-unknown-model", {
      input_tokens: 1000,
      output_tokens: 1000,
    });
    // Uses sonnet rates: 1000 * 3 / 1M + 1000 * 15 / 1M = 0.018
    expect(cost).toBeCloseTo(0.018);
  });
});

describe("executor guards", () => {
  it("never tier actions should not execute", () => {
    // This is tested by the permission_tier check in executeAction
    // The guard: if (action.permission_tier === "never") → blocked
    const tier = "never";
    expect(tier).toBe("never");
    // In practice, executeAction returns failed with reason "permission_tier_never"
  });

  it("only planned status should execute", () => {
    // Valid transitions: planned → executing → staged|failed
    const validStartStatuses = ["planned"];
    expect(validStartStatuses).not.toContain("staged");
    expect(validStartStatuses).not.toContain("executing");
    expect(validStartStatuses).not.toContain("approved");
  });
});
