import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the neon serverless module
const mockSql = vi.fn();
const mockTaggedSql = Object.assign(
  (..._args: unknown[]) => mockSql(..._args),
  // Tagged template literal support
) as unknown as ReturnType<typeof import("@neondatabase/serverless").neon>;

// Make the tagged template function work for tagged template calls
function createTaggedMock(returnValue: unknown[]) {
  const fn = vi.fn().mockResolvedValue(returnValue);
  // Support both tagged template and regular calls
  return Object.assign(fn, {}) as any;
}

vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => createTaggedMock([])),
}));

vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    OPENAI_API_KEY: "test-key",
  },
}));

vi.mock("@/lib/brain/embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
}));

vi.mock("@/lib/brain/metadata", () => ({
  extractMetadata: vi.fn().mockResolvedValue({
    thought_type: "insight",
    people: ["Alice"],
    topics: ["testing"],
    action_items: [],
  }),
}));

import { neon } from "@neondatabase/serverless";

describe("queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("queryThoughtById", () => {
    it("returns a thought when found", async () => {
      const mockThought = {
        id: "abc-123",
        raw_text: "Test thought",
        thought_type: "insight",
        status: "active",
        people: [],
        topics: ["test"],
        action_items: [],
        source: "mcp",
        created_at: "2026-03-15T00:00:00Z",
        updated_at: "2026-03-15T00:00:00Z",
      };

      const taggedFn = createTaggedMock([mockThought]);
      vi.mocked(neon).mockReturnValue(taggedFn);

      const { queryThoughtById } = await import("@/lib/brain/queries");
      const result = await queryThoughtById("abc-123");

      expect(result).toEqual(mockThought);
    });

    it("returns null when not found", async () => {
      const taggedFn = createTaggedMock([]);
      vi.mocked(neon).mockReturnValue(taggedFn);

      const { queryThoughtById } = await import("@/lib/brain/queries");
      const result = await queryThoughtById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("queryRecent", () => {
    it("returns recent thoughts", async () => {
      const mockThoughts = [
        {
          id: "1",
          raw_text: "Recent thought",
          thought_type: "reflection",
          status: "active",
          people: [],
          topics: [],
          action_items: [],
          source: "mcp",
          created_at: "2026-03-15T00:00:00Z",
          updated_at: "2026-03-15T00:00:00Z",
        },
      ];

      const taggedFn = createTaggedMock(mockThoughts);
      vi.mocked(neon).mockReturnValue(taggedFn);

      const { queryRecent } = await import("@/lib/brain/queries");
      const result = await queryRecent(7, 20);

      expect(result).toHaveLength(1);
      expect(result[0].raw_text).toBe("Recent thought");
    });
  });

  describe("queryStats", () => {
    it("returns aggregated stats", async () => {
      const taggedFn = vi.fn()
        .mockResolvedValueOnce([{ total: "42" }])
        .mockResolvedValueOnce([{ recent: "10" }])
        .mockResolvedValueOnce([{ thought_type: "insight", cnt: "5" }])
        .mockResolvedValueOnce([{ topic: "testing", cnt: "3" }])
        .mockResolvedValueOnce([{ person: "Alice", cnt: "2" }])
        .mockResolvedValueOnce([{ daily_avg: "1.5" }])
        .mockResolvedValueOnce([{ cnt: "4" }]);

      vi.mocked(neon).mockReturnValue(taggedFn as any);

      const { queryStats } = await import("@/lib/brain/queries");
      const result = await queryStats(30);

      expect(result.total).toBe(42);
      expect(result.recent).toBe(10);
      expect(result.dailyAvg).toBe(1.5);
      expect(result.byType).toHaveLength(1);
      expect(result.topTopics).toHaveLength(1);
      expect(result.topPeople).toHaveLength(1);
      expect(result.openTasks).toBe(4);
    });
  });

  describe("insertThought", () => {
    it("inserts with embedding and metadata extraction", async () => {
      const mockResult = {
        id: "new-id",
        raw_text: "A new insight",
        thought_type: "insight",
        status: "active",
        people: ["Alice"],
        topics: ["testing"],
        action_items: [],
        source: "dashboard",
        created_at: "2026-03-15T00:00:00Z",
        updated_at: "2026-03-15T00:00:00Z",
      };

      const taggedFn = createTaggedMock([mockResult]);
      vi.mocked(neon).mockReturnValue(taggedFn);

      const { insertThought } = await import("@/lib/brain/queries");
      const result = await insertThought("A new insight", "dashboard");

      expect(result.id).toBe("new-id");
      expect(result.thought_type).toBe("insight");
      expect(result.people).toEqual(["Alice"]);
    });
  });

  describe("removeThought", () => {
    it("returns true when thought is deleted", async () => {
      const taggedFn = createTaggedMock([{ id: "abc" }]);
      vi.mocked(neon).mockReturnValue(taggedFn);

      const { removeThought } = await import("@/lib/brain/queries");
      const result = await removeThought("abc");

      expect(result).toBe(true);
    });

    it("returns false when thought not found", async () => {
      const taggedFn = createTaggedMock([]);
      vi.mocked(neon).mockReturnValue(taggedFn);

      const { removeThought } = await import("@/lib/brain/queries");
      const result = await removeThought("nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("updateTaskStatus", () => {
    it("updates status for action_item thoughts", async () => {
      const mockResult = {
        id: "task-1",
        raw_text: "Do something",
        thought_type: "action_item",
        status: "completed",
        people: [],
        topics: [],
        action_items: ["Do something"],
        source: "mcp",
        created_at: "2026-03-15T00:00:00Z",
        updated_at: "2026-03-15T00:00:00Z",
      };

      const taggedFn = createTaggedMock([mockResult]);
      vi.mocked(neon).mockReturnValue(taggedFn);

      const { updateTaskStatus } = await import("@/lib/brain/queries");
      const result = await updateTaskStatus("task-1", "completed");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("completed");
    });

    it("returns null when thought not found", async () => {
      const taggedFn = createTaggedMock([]);
      vi.mocked(neon).mockReturnValue(taggedFn);

      const { updateTaskStatus } = await import("@/lib/brain/queries");
      const result = await updateTaskStatus("nonexistent", "completed");

      expect(result).toBeNull();
    });
  });

  describe("queryAlerts", () => {
    it("returns alerts from all three categories", async () => {
      const taggedFn = vi.fn()
        .mockResolvedValueOnce([
          { id: "aging-1", raw_text: "Old untriaged task", age_days: 5 },
        ])
        .mockResolvedValueOnce([
          { id: "stale-1", raw_text: "Stale active task", age_days: 20 },
        ])
        .mockResolvedValueOnce([
          { person: "Bob", last_mention: "2026-02-01", age_days: 42 },
        ]);

      vi.mocked(neon).mockReturnValue(taggedFn as any);

      const { queryAlerts } = await import("@/lib/brain/queries");
      const alerts = await queryAlerts();

      expect(alerts).toHaveLength(3);
      expect(alerts[0].type).toBe("aging_untriaged");
      expect(alerts[0].thought_id).toBe("aging-1");
      expect(alerts[1].type).toBe("stale_active");
      expect(alerts[2].type).toBe("relationship_decay");
      expect(alerts[2].person).toBe("Bob");
      expect(alerts[2].age_days).toBe(42);
    });

    it("returns empty array when no alerts", async () => {
      const taggedFn = vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      vi.mocked(neon).mockReturnValue(taggedFn as any);

      const { queryAlerts } = await import("@/lib/brain/queries");
      const alerts = await queryAlerts();

      expect(alerts).toEqual([]);
    });
  });
});
