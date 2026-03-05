import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { verifyMcpAuth } from "@/lib/auth/mcp-auth";
import {
  capture,
  semanticSearch,
  searchByPerson,
  searchByTopic,
  listRecent,
  stats,
  deleteThought,
} from "@/lib/brain/tools";

function createServer(): McpServer {
  const server = new McpServer(
    { name: "open-brain", version: "0.1.0" },
    { capabilities: { tools: { listChanged: true } } }
  );

  server.tool(
    "capture",
    "Capture a new thought into your brain. Generates an embedding and extracts metadata automatically.",
    {
      text: z.string().describe("The thought, note, decision, or insight to capture."),
      source: z.string().default("mcp").describe("Where this thought came from."),
    },
    async ({ text, source }) => ({
      content: [{ type: "text" as const, text: await capture(text, source) }],
    })
  );

  server.tool(
    "semantic_search",
    "Search your brain by meaning. Finds thoughts semantically similar to your query.",
    {
      query: z.string().describe("What you're looking for, described naturally."),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum results."),
    },
    async ({ query, limit }) => ({
      content: [{ type: "text" as const, text: await semanticSearch(query, limit) }],
    })
  );

  server.tool(
    "search_by_person",
    "Find all thoughts that mention a specific person.",
    {
      name: z.string().describe("Person's name (case-insensitive partial match)."),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum results."),
    },
    async ({ name, limit }) => ({
      content: [{ type: "text" as const, text: await searchByPerson(name, limit) }],
    })
  );

  server.tool(
    "search_by_topic",
    "Find all thoughts tagged with a specific topic.",
    {
      topic: z.string().describe("Topic to search for (case-insensitive partial match)."),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum results."),
    },
    async ({ topic, limit }) => ({
      content: [{ type: "text" as const, text: await searchByTopic(topic, limit) }],
    })
  );

  server.tool(
    "list_recent",
    "List recently captured thoughts.",
    {
      days: z.number().int().min(1).max(365).default(7).describe("How many days back."),
      limit: z.number().int().min(1).max(100).default(20).describe("Maximum results."),
    },
    async ({ days, limit }) => ({
      content: [{ type: "text" as const, text: await listRecent(days, limit) }],
    })
  );

  server.tool(
    "stats",
    "View your brain's statistics: capture frequency, topic distribution, and patterns.",
    {
      days: z.number().int().min(1).max(365).default(30).describe("Days to analyze."),
    },
    async ({ days }) => ({
      content: [{ type: "text" as const, text: await stats(days) }],
    })
  );

  server.tool(
    "delete_thought",
    "Delete a thought from your brain by its ID.",
    {
      thought_id: z.string().uuid().describe("The UUID of the thought to delete."),
    },
    async ({ thought_id }) => ({
      content: [{ type: "text" as const, text: await deleteThought(thought_id) }],
    })
  );

  return server;
}

export async function POST(req: Request) {
  // Verify Clerk OAuth token — returns 401 with WWW-Authenticate if missing/invalid
  const authResult = await verifyMcpAuth(req);
  if (authResult instanceof Response) return authResult;

  // Fresh server + transport per request — stateless, serverless-safe
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(req, { authInfo: authResult });
}

export async function GET() {
  return new Response("Open Brain MCP Server", { status: 200 });
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}
