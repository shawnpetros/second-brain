import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  capture,
  semanticSearch,
  searchByPerson,
  searchByTopic,
  listRecent,
  stats,
  deleteThought,
} from "@/lib/brain/tools";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "capture",
      {
        title: "Capture Thought",
        description:
          "Capture a new thought into your brain. Generates an embedding and extracts metadata automatically.",
        inputSchema: z.object({
          text: z
            .string()
            .describe(
              "The thought, note, decision, or insight to capture."
            ),
          source: z
            .string()
            .default("mcp")
            .describe(
              'Where this thought came from. Options: mcp, cli, slack, migration.'
            ),
        }),
      },
      async ({ text, source }) => ({
        content: [{ type: "text", text: await capture(text, source) }],
      })
    );

    server.registerTool(
      "semantic_search",
      {
        title: "Semantic Search",
        description:
          "Search your brain by meaning. Finds thoughts semantically similar to your query, not just keyword matches.",
        inputSchema: z.object({
          query: z
            .string()
            .describe("What you're looking for, described naturally."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe("Maximum number of results to return."),
        }),
      },
      async ({ query, limit }) => ({
        content: [
          { type: "text", text: await semanticSearch(query, limit) },
        ],
      })
    );

    server.registerTool(
      "search_by_person",
      {
        title: "Search by Person",
        description: "Find all thoughts that mention a specific person.",
        inputSchema: z.object({
          name: z
            .string()
            .describe(
              "The person's name to search for (case-insensitive partial match)."
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe("Maximum number of results."),
        }),
      },
      async ({ name, limit }) => ({
        content: [
          { type: "text", text: await searchByPerson(name, limit) },
        ],
      })
    );

    server.registerTool(
      "search_by_topic",
      {
        title: "Search by Topic",
        description: "Find all thoughts tagged with a specific topic.",
        inputSchema: z.object({
          topic: z
            .string()
            .describe(
              "The topic to search for (case-insensitive partial match)."
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe("Maximum number of results."),
        }),
      },
      async ({ topic, limit }) => ({
        content: [
          { type: "text", text: await searchByTopic(topic, limit) },
        ],
      })
    );

    server.registerTool(
      "list_recent",
      {
        title: "List Recent",
        description: "List recently captured thoughts.",
        inputSchema: z.object({
          days: z
            .number()
            .int()
            .min(1)
            .max(365)
            .default(7)
            .describe("How many days back to look."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .default(20)
            .describe("Maximum number of results."),
        }),
      },
      async ({ days, limit }) => ({
        content: [{ type: "text", text: await listRecent(days, limit) }],
      })
    );

    server.registerTool(
      "stats",
      {
        title: "Brain Stats",
        description:
          "View your brain's statistics: capture frequency, topic distribution, and patterns.",
        inputSchema: z.object({
          days: z
            .number()
            .int()
            .min(1)
            .max(365)
            .default(30)
            .describe("How many days to analyze."),
        }),
      },
      async ({ days }) => ({
        content: [{ type: "text", text: await stats(days) }],
      })
    );

    server.registerTool(
      "delete_thought",
      {
        title: "Delete Thought",
        description: "Delete a thought from your brain by its ID.",
        inputSchema: z.object({
          thought_id: z.string().uuid().describe("The UUID of the thought to delete."),
        }),
      },
      async ({ thought_id }) => ({
        content: [
          { type: "text", text: await deleteThought(thought_id) },
        ],
      })
    );
  },
  { serverInfo: { name: "open-brain", version: "0.1.0" } },
  {
    basePath: "/api",
    maxDuration: 60,
    disableSse: true,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
