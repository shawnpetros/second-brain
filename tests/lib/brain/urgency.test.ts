import { describe, it, expect } from "vitest";
import { calculateUrgencyScore, getAgeMultiplier, isForceResolution, isSnoozed } from "@/lib/brain/urgency";

describe("getAgeMultiplier", () => {
  it("returns 1.0 for 0-2 day old items", () => {
    expect(getAgeMultiplier(0)).toBe(1.0);
    expect(getAgeMultiplier(1)).toBe(1.0);
    expect(getAgeMultiplier(2)).toBe(1.0);
  });
  it("returns 2.0 for 3-5 day old items", () => {
    expect(getAgeMultiplier(3)).toBe(2.0);
    expect(getAgeMultiplier(5)).toBe(2.0);
  });
  it("returns 4.0 for 6-10 day old items", () => {
    expect(getAgeMultiplier(6)).toBe(4.0);
    expect(getAgeMultiplier(10)).toBe(4.0);
  });
  it("returns 8.0 for 11-14 day old items", () => {
    expect(getAgeMultiplier(11)).toBe(8.0);
    expect(getAgeMultiplier(14)).toBe(8.0);
  });
  it("returns 15.0 for 15-21 day old items", () => {
    expect(getAgeMultiplier(15)).toBe(15.0);
    expect(getAgeMultiplier(21)).toBe(15.0);
  });
  it("returns 15.0 for 21+ day items", () => {
    expect(getAgeMultiplier(30)).toBe(15.0);
  });
});

describe("isForceResolution", () => {
  it("returns true for items older than 21 days", () => {
    expect(isForceResolution(22)).toBe(true);
  });
  it("returns false for items 21 days or younger", () => {
    expect(isForceResolution(21)).toBe(false);
    expect(isForceResolution(5)).toBe(false);
  });
});

describe("isSnoozed", () => {
  it("returns true when snoozed_until is in the future", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isSnoozed(future)).toBe(true);
  });
  it("returns false when snoozed_until is in the past", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isSnoozed(past)).toBe(false);
  });
  it("returns false when snoozed_until is null", () => {
    expect(isSnoozed(null)).toBe(false);
  });
});

describe("calculateUrgencyScore", () => {
  it("scores a fresh action_item at base weight", () => {
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 0,
      people: [],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: null,
    });
    expect(score).toBe(10);
  });

  it("scores a 6-day action_item with person at 42", () => {
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 6,
      people: ["RJ"],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: null,
    });
    expect(score).toBe(42);
  });

  it("applies deadline boost", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 1,
      people: [],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: tomorrow,
    });
    expect(score).toBe(13);
  });

  it("does not apply deadline boost if deadline is far away", () => {
    const farFuture = new Date(Date.now() + 7 * 86400000).toISOString();
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 1,
      people: [],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: farFuture,
    });
    expect(score).toBe(10);
  });

  it("stacks all boosts", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 1,
      people: ["Alice"],
      has_blocking_edge: true,
      referenced_in_briefing: true,
      action_items: ["do thing"],
      deadline: tomorrow,
    });
    expect(score).toBe(19);
  });

  it("uses lower base weight for ideas", () => {
    const score = calculateUrgencyScore({
      thought_type: "idea",
      age_days: 6,
      people: [],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: null,
    });
    expect(score).toBe(12);
  });
});
