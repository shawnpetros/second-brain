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
  listTasks,
  completeTask,
  skipTask,
  untriageTask,
  listProjectsTool,
  getProjectContext,
  assignProject,
  addEdge,
  listEdges,
  removeEdgeTool,
  getLatestBriefing,
  listBriefings,
  snoozeTask,
} from "@/lib/brain/tools";

function createServer(): McpServer {
  const server = new McpServer(
    { name: "open-brain", version: "0.1.0" },
    { capabilities: { tools: { listChanged: true } } }
  );

  server.tool(
    "capture",
    "Capture a new thought into your brain. Generates an embedding and extracts metadata automatically. When capturing session handoffs, split distinct categories (milestones, insights, action items) into separate captures with the appropriate thought_type hint.",
    {
      text: z.string().describe("The thought, note, decision, or insight to capture."),
      source: z.string().default("mcp").describe("Where this thought came from."),
      thought_type: z.enum([
        "decision", "insight", "meeting", "person_note",
        "idea", "action_item", "reflection", "reference", "milestone", "cadence",
      ]).optional().describe("Optional type hint. If provided, overrides auto-classification. Use 'milestone' for accomplishments/shipped work, 'action_item' for remaining tasks, 'cadence' for recurring schedules/patterns."),
    },
    async ({ text, source, thought_type }) => ({
      content: [{ type: "text" as const, text: await capture(text, source, thought_type) }],
    })
  );

  server.tool(
    "semantic_search",
    "Search your brain by meaning. Finds thoughts semantically similar to your query.",
    {
      query: z.string().describe("What you're looking for, described naturally."),
      limit: z.coerce.number().int().min(1).max(50).default(10).describe("Maximum results."),
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
      limit: z.coerce.number().int().min(1).max(50).default(10).describe("Maximum results."),
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
      limit: z.coerce.number().int().min(1).max(50).default(10).describe("Maximum results."),
    },
    async ({ topic, limit }) => ({
      content: [{ type: "text" as const, text: await searchByTopic(topic, limit) }],
    })
  );

  server.tool(
    "list_recent",
    "List recently captured thoughts.",
    {
      days: z.coerce.number().int().min(1).max(365).default(7).describe("How many days back."),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe("Maximum results."),
    },
    async ({ days, limit }) => ({
      content: [{ type: "text" as const, text: await listRecent(days, limit) }],
    })
  );

  server.tool(
    "stats",
    "View your brain's statistics: capture frequency, topic distribution, and patterns.",
    {
      days: z.coerce.number().int().min(1).max(365).default(30).describe("Days to analyze."),
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

  server.tool(
    "list_tasks",
    "List tasks (action_item thoughts) filtered by status. Use this to surface untriaged tasks at session start or review active/completed tasks.",
    {
      status: z
        .enum(["untriaged", "active", "completed", "skipped"])
        .default("untriaged")
        .describe("Filter tasks by status."),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe("Maximum results."),
    },
    async ({ status, limit }) => ({
      content: [{ type: "text" as const, text: await listTasks(status, limit) }],
    })
  );

  server.tool(
    "complete_task",
    "Mark a task as completed. Non-destructive — the thought is kept but marked done.",
    {
      thought_id: z.string().uuid().describe("The UUID of the action_item to complete."),
    },
    async ({ thought_id }) => ({
      content: [{ type: "text" as const, text: await completeTask(thought_id) }],
    })
  );

  server.tool(
    "skip_task",
    "Skip a task for now — moves it from untriaged to active so it won't appear in triage but stays on your radar.",
    {
      thought_id: z.string().uuid().describe("The UUID of the action_item to skip."),
    },
    async ({ thought_id }) => ({
      content: [{ type: "text" as const, text: await skipTask(thought_id) }],
    })
  );

  server.tool(
    "untriage_task",
    "Move a task back to untriaged status — useful when a task needs re-evaluation or was triaged prematurely.",
    {
      thought_id: z.string().uuid().describe("The UUID of the action_item to untriage."),
    },
    async ({ thought_id }) => ({
      content: [{ type: "text" as const, text: await untriageTask(thought_id) }],
    })
  );

  // ── Project tools ──

  server.tool(
    "list_projects",
    "List all projects in the brain with thought counts. Projects are first-class entities linked to thoughts.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await listProjectsTool() }],
    })
  );

  server.tool(
    "get_project_context",
    "Get full context for a project — open tasks, recent decisions, last milestone, insights, and blocking edges. Use this at session start to load project state.",
    {
      slug: z.string().describe("Project slug (e.g. 'intel-app', 'second-brain', 'content-pipeline')."),
    },
    async ({ slug }) => ({
      content: [{ type: "text" as const, text: await getProjectContext(slug) }],
    })
  );

  server.tool(
    "assign_thought_project",
    "Assign a thought to a project. Links the thought to a project entity for project-scoped views and context.",
    {
      thought_id: z.string().uuid().describe("The UUID of the thought to assign."),
      project_slug: z.string().describe("The project slug to assign to."),
    },
    async ({ thought_id, project_slug }) => ({
      content: [{ type: "text" as const, text: await assignProject(thought_id, project_slug) }],
    })
  );

  // ── Edge tools ──

  server.tool(
    "add_edge",
    "Create a typed directed edge between two thoughts. Edge types: relates_to, blocks, caused_by, inspired_by, contradicts, child_of. If the edge already exists, updates its weight.",
    {
      from_thought_id: z.string().uuid().describe("Source thought UUID."),
      to_thought_id: z.string().uuid().describe("Target thought UUID."),
      edge_type: z.enum(["relates_to", "blocks", "caused_by", "inspired_by", "contradicts", "child_of"])
        .describe("Relationship type between the thoughts."),
      weight: z.coerce.number().min(0).max(10).default(1.0)
        .describe("Edge weight (0-10). Higher = stronger relationship. Default 1.0."),
    },
    async ({ from_thought_id, to_thought_id, edge_type, weight }) => ({
      content: [{ type: "text" as const, text: await addEdge(from_thought_id, to_thought_id, edge_type, weight) }],
    })
  );

  server.tool(
    "list_edges",
    "List all edges connected to a thought (both inbound and outbound). Shows relationship type, weight, and connected thought previews.",
    {
      thought_id: z.string().uuid().describe("The UUID of the thought to find edges for."),
    },
    async ({ thought_id }) => ({
      content: [{ type: "text" as const, text: await listEdges(thought_id) }],
    })
  );

  server.tool(
    "remove_edge",
    "Delete an edge between two thoughts by its edge ID.",
    {
      edge_id: z.string().uuid().describe("The UUID of the edge to delete."),
    },
    async ({ edge_id }) => ({
      content: [{ type: "text" as const, text: await removeEdgeTool(edge_id) }],
    })
  );

  // ── Snooze tool ──

  server.tool(
    "snooze_task",
    "Snooze a task for a set number of days. The task won't appear in triage or briefings until it wakes. Snoozing doesn't reset the age clock — the task comes back at its original age. Max 3 snoozes per task.",
    {
      thought_id: z.string().uuid().describe("The UUID of the action_item to snooze."),
      days: z.enum(["2", "5", "7"]).describe("How many days to snooze: 2, 5, or 7."),
    },
    async ({ thought_id, days }) => ({
      content: [{ type: "text" as const, text: await snoozeTask(thought_id, Number(days) as 2 | 5 | 7) }],
    })
  );

  // ── Briefing tools ──

  server.tool(
    "get_latest_briefing",
    "Get the most recent morning briefing — a synthesized summary of brain activity, open tasks, cross-project patterns, and priorities.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await getLatestBriefing() }],
    })
  );

  server.tool(
    "list_briefings",
    "List recent morning briefings with dates and stats.",
    {
      limit: z.coerce.number().int().min(1).max(30).default(5).describe("Maximum briefings to return."),
    },
    async ({ limit }) => ({
      content: [{ type: "text" as const, text: await listBriefings(limit) }],
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
