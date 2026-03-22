import { describe, it, expect } from "vitest";
import { getPermissionTier, selectModel } from "@/lib/brain/permissions";

describe("getPermissionTier", () => {
  it("returns auto for research", () => {
    expect(getPermissionTier("research")).toBe("auto");
  });
  it("returns staged for draft_email", () => {
    expect(getPermissionTier("draft_email")).toBe("staged");
  });
  it("returns never for send_email", () => {
    expect(getPermissionTier("send_email")).toBe("never");
  });
  it("returns never for unknown action types (fail closed)", () => {
    expect(getPermissionTier("hack_the_planet")).toBe("never");
  });
  it("never-tier cannot be overridden", () => {
    expect(getPermissionTier("send_email", { send_email: "auto" })).toBe("never");
  });
  it("staged can be overridden to auto", () => {
    expect(getPermissionTier("draft_content", { draft_content: "auto" })).toBe("auto");
  });
  it("auto cannot be overridden (already lowest gate)", () => {
    expect(getPermissionTier("research", { research: "staged" })).toBe("auto");
  });
});

describe("selectModel", () => {
  it("returns sonnet for standard research", () => {
    expect(selectModel({
      action: { action_type: "research", stakes: "low", permission_tier: "auto" },
      sourceThought: { topics: ["coding"] },
    })).toBe("claude-sonnet-4-6");
  });
  it("returns opus for high-stakes drafts", () => {
    expect(selectModel({
      action: { action_type: "draft_email", stakes: "high", permission_tier: "staged" },
      sourceThought: { topics: ["client"] },
    })).toBe("claude-opus-4-6");
  });
  it("returns opus for medical topics in staged tier", () => {
    expect(selectModel({
      action: { action_type: "draft_email", stakes: "medium", permission_tier: "staged" },
      sourceThought: { topics: ["medical", "CSF leak"] },
    })).toBe("claude-opus-4-6");
  });
  it("does not use opus for auto-tier even with sensitive topics", () => {
    expect(selectModel({
      action: { action_type: "research", stakes: "medium", permission_tier: "auto" },
      sourceThought: { topics: ["medical"] },
    })).toBe("claude-sonnet-4-6");
  });
});
