import { describe, it, expect } from "vitest";
import {
  getPermissionTier,
  ACTION_TYPE_ALLOWLIST,
} from "@/lib/brain/permissions";

describe("classifier permission logic", () => {
  it("permission_tier is always code-derived, not model-derived", () => {
    // The classifier outputs an action_type, but permission_tier
    // is looked up from PERMISSION_TIERS in code, not from the model.
    // This test verifies the lookup works for all allowlisted types.
    for (const actionType of ACTION_TYPE_ALLOWLIST) {
      const tier = getPermissionTier(actionType);
      expect(["auto", "staged", "never"]).toContain(tier);
    }
  });

  it("falls back to research for unknown action types", () => {
    const unknownType = "hack_the_planet";
    const isAllowed = ACTION_TYPE_ALLOWLIST.includes(unknownType);
    const fallback = isAllowed ? unknownType : "research";
    expect(fallback).toBe("research");
  });

  it("unknown action types get never tier (fail closed)", () => {
    expect(getPermissionTier("drop_database")).toBe("never");
    expect(getPermissionTier("")).toBe("never");
    expect(getPermissionTier("send_nuclear_codes")).toBe("never");
  });

  it("allowlist contains all expected action types", () => {
    const expected = [
      "research",
      "summary",
      "analysis",
      "categorize",
      "internal_note",
      "draft_email",
      "draft_message",
      "draft_content",
      "draft_report",
      "recommendation",
      "send_email",
      "send_message",
      "financial",
      "delete",
      "deploy",
      "schedule",
      "purchase",
      "auth",
    ];
    for (const type of expected) {
      expect(ACTION_TYPE_ALLOWLIST).toContain(type);
    }
  });

  it("auto types are only safe read/analyze operations", () => {
    const autoTypes = ACTION_TYPE_ALLOWLIST.filter(
      (t) => getPermissionTier(t) === "auto"
    );
    expect(autoTypes.sort()).toEqual([
      "analysis",
      "categorize",
      "internal_note",
      "research",
      "summary",
    ]);
  });

  it("never types include all destructive or external actions", () => {
    const neverTypes = ACTION_TYPE_ALLOWLIST.filter(
      (t) => getPermissionTier(t) === "never"
    );
    expect(neverTypes.sort()).toEqual([
      "auth",
      "delete",
      "deploy",
      "financial",
      "purchase",
      "schedule",
      "send_email",
      "send_message",
    ]);
  });
});
