import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the queries module
vi.mock("@/lib/brain/queries", () => ({
  querySemanticSearch: vi.fn(),
  queryByPerson: vi.fn(),
  queryByTopic: vi.fn(),
  queryRecent: vi.fn(),
  queryStats: vi.fn(),
  insertThought: vi.fn(),
  removeThought: vi.fn(),
  queryThoughts: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

import {
  querySemanticSearch,
  queryByPerson,
  queryByTopic,
  queryRecent,
  queryStats,
  insertThought,
  removeThought,
  queryThoughts,
  updateTaskStatus,
} from "@/lib/brain/queries";
import {
  capture,
  semanticSearch,
  searchByPerson,
  searchByTopic,
  listRecent,
  stats,
  deleteThought,
  listTasks,
  completeTask,
  skipTask,
  untriageTask,
} from "@/lib/brain/tools";

const mockThought = {
  id: "abc-123",
  raw_text: "Test thought about testing",
  thought_type: "insight",
  status: "active",
  people: ["Alice"],
  topics: ["testing", "quality"],
  action_items: [],
  source: "mcp",
  created_at: "2026-03-15T10:00:00Z",
  updated_at: "2026-03-15T10:00:00Z",
};

const mockTask = {
  ...mockThought,
  id: "task-1",
  raw_text: "Write more tests",
  thought_type: "action_item",
  status: "untriaged",
  action_items: ["Write more tests"],
};

describe("tools.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("capture", () => {
    it("formats captured thought as markdown", async () => {
      vi.mocked(insertThought).mockResolvedValue(mockThought);

      const result = await capture("Test thought about testing");

      expect(result).toContain("Captured as **insight**.");
      expect(result).toContain("Topics: testing, quality");
      expect(result).toContain("People: Alice");
      expect(result).toContain("ID: abc-123");
      expect(insertThought).toHaveBeenCalledWith("Test thought about testing", "mcp", undefined);
    });

    it("passes custom source", async () => {
      vi.mocked(insertThought).mockResolvedValue(mockThought);

      await capture("Test", "dashboard");

      expect(insertThought).toHaveBeenCalledWith("Test", "dashboard", undefined);
    });

    it("shows action items when present", async () => {
      vi.mocked(insertThought).mockResolvedValue(mockTask);

      const result = await capture("Write more tests");

      expect(result).toContain("Action items:");
      expect(result).toContain("  - Write more tests");
    });
  });

  describe("semanticSearch", () => {
    it("formats results with similarity scores", async () => {
      vi.mocked(querySemanticSearch).mockResolvedValue([
        { ...mockThought, similarity: 0.945 },
      ]);

      const result = await semanticSearch("testing");

      expect(result).toContain("Found 1 thoughts:");
      expect(result).toContain("[0.945]");
      expect(result).toContain("Test thought about testing");
      expect(querySemanticSearch).toHaveBeenCalledWith("testing", 10);
    });

    it("handles empty results", async () => {
      vi.mocked(querySemanticSearch).mockResolvedValue([]);

      const result = await semanticSearch("nonexistent");

      expect(result).toContain("brain is empty");
    });

    it("passes custom limit", async () => {
      vi.mocked(querySemanticSearch).mockResolvedValue([]);

      await semanticSearch("test", 5);

      expect(querySemanticSearch).toHaveBeenCalledWith("test", 5);
    });
  });

  describe("searchByPerson", () => {
    it("formats results with person mention count", async () => {
      vi.mocked(queryByPerson).mockResolvedValue([mockThought]);

      const result = await searchByPerson("Alice");

      expect(result).toContain("Found 1 thoughts mentioning 'Alice':");
      expect(result).toContain("Test thought about testing");
    });

    it("handles no matches", async () => {
      vi.mocked(queryByPerson).mockResolvedValue([]);

      const result = await searchByPerson("Nobody");

      expect(result).toContain("No thoughts found mentioning 'Nobody'.");
    });
  });

  describe("searchByTopic", () => {
    it("formats results with topic", async () => {
      vi.mocked(queryByTopic).mockResolvedValue([mockThought]);

      const result = await searchByTopic("testing");

      expect(result).toContain("Found 1 thoughts about 'testing':");
    });

    it("handles no matches", async () => {
      vi.mocked(queryByTopic).mockResolvedValue([]);

      const result = await searchByTopic("nothing");

      expect(result).toContain("No thoughts found with topic 'nothing'.");
    });
  });

  describe("listRecent", () => {
    it("formats recent thoughts", async () => {
      vi.mocked(queryRecent).mockResolvedValue([mockThought]);

      const result = await listRecent(7, 20);

      expect(result).toContain("1 thoughts from the last 7 days:");
      expect(queryRecent).toHaveBeenCalledWith(7, 20);
    });

    it("handles empty results", async () => {
      vi.mocked(queryRecent).mockResolvedValue([]);

      const result = await listRecent(1);

      expect(result).toContain("No thoughts captured in the last 1 days.");
    });
  });

  describe("stats", () => {
    it("formats stats as markdown", async () => {
      vi.mocked(queryStats).mockResolvedValue({
        total: 100,
        recent: 25,
        dailyAvg: 3.5,
        byType: [{ thought_type: "insight", count: 10 }],
        topTopics: [{ topic: "testing", count: 5 }],
        topPeople: [{ person: "Alice", count: 3 }],
        openTasks: 8,
      });

      const result = await stats(30);

      expect(result).toContain("## Brain Stats (last 30 days)");
      expect(result).toContain("**Total thoughts:** 100");
      expect(result).toContain("**Last 30 days:** 25");
      expect(result).toContain("**Daily average:** 3.5 thoughts/day");
      expect(result).toContain("insight: 10");
      expect(result).toContain("testing: 5");
      expect(result).toContain("Alice: 3");
    });
  });

  describe("deleteThought", () => {
    it("confirms deletion", async () => {
      vi.mocked(removeThought).mockResolvedValue(true);

      const result = await deleteThought("abc-123");

      expect(result).toBe("Deleted thought abc-123.");
    });

    it("handles missing thought", async () => {
      vi.mocked(removeThought).mockResolvedValue(false);

      const result = await deleteThought("nonexistent");

      expect(result).toContain("No thought found with ID nonexistent.");
    });
  });

  describe("listTasks", () => {
    it("lists tasks with given status", async () => {
      vi.mocked(queryThoughts).mockResolvedValue([mockTask]);

      const result = await listTasks("untriaged");

      expect(result).toContain("1 untriaged task(s):");
      expect(result).toContain("Write more tests");
      expect(queryThoughts).toHaveBeenCalledWith({
        type: "action_item",
        status: "untriaged",
        limit: 20,
      });
    });

    it("handles empty task list", async () => {
      vi.mocked(queryThoughts).mockResolvedValue([]);

      const result = await listTasks("completed");

      expect(result).toBe("No completed tasks found.");
    });
  });

  describe("completeTask", () => {
    it("confirms task completion", async () => {
      vi.mocked(updateTaskStatus).mockResolvedValue({
        ...mockTask,
        status: "completed",
      });

      const result = await completeTask("task-1");

      expect(result).toContain("Completed task: Write more tests");
      expect(updateTaskStatus).toHaveBeenCalledWith("task-1", "completed");
    });

    it("handles missing task", async () => {
      vi.mocked(updateTaskStatus).mockResolvedValue(null);

      const result = await completeTask("nonexistent");

      expect(result).toContain("No action_item found");
    });
  });

  describe("skipTask", () => {
    it("confirms task skip", async () => {
      vi.mocked(updateTaskStatus).mockResolvedValue({
        ...mockTask,
        status: "active",
      });

      const result = await skipTask("task-1");

      expect(result).toContain("Skipped (moved to active): Write more tests");
      expect(updateTaskStatus).toHaveBeenCalledWith("task-1", "active");
    });
  });

  describe("untriageTask", () => {
    it("confirms task untriage", async () => {
      vi.mocked(updateTaskStatus).mockResolvedValue({
        ...mockTask,
        status: "untriaged",
      });

      const result = await untriageTask("task-1");

      expect(result).toContain("Moved back to untriaged: Write more tests");
      expect(updateTaskStatus).toHaveBeenCalledWith("task-1", "untriaged");
    });
  });
});
