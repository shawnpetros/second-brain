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
  queryProjects,
  queryProjectContext,
  assignThoughtProject,
  insertEdge,
  queryEdgesByThought,
  removeEdge as removeEdgeQuery,
  queryLatestBriefing,
  queryBriefings,
  snoozeTask as snoozeTaskQuery,
  type ThoughtRecord,
  type EdgeRecord,
} from "./queries";

function formatThought(row: ThoughtRecord): string {
  const type = row.thought_type.replace(/_/g, " ");
  const date = new Date(row.created_at).toISOString().slice(0, 16).replace("T", " ");
  const statusLabel = row.status && row.status !== "untriaged" ? ` [${row.status}]` : "";
  const parts = [
    `**${type.charAt(0).toUpperCase() + type.slice(1)}**${statusLabel} — ${date}`,
    `  ${row.raw_text}`,
  ];
  if (row.people?.length) parts.push(`  People: ${row.people.join(", ")}`);
  if (row.topics?.length) parts.push(`  Topics: ${row.topics.join(", ")}`);
  if (row.action_items?.length) {
    for (const item of row.action_items) parts.push(`  - [ ] ${item}`);
  }
  parts.push(`  ID: ${row.id}`);
  return parts.join("\n");
}

export async function capture(text: string, source = "mcp", thoughtType?: string): Promise<string> {
  const row = await insertThought(text, source, thoughtType);

  const parts = [
    `Captured as **${row.thought_type.replace(/_/g, " ")}**.`,
    `Topics: ${row.topics?.length ? row.topics.join(", ") : "none detected"}`,
  ];
  if (row.people?.length) parts.push(`People: ${row.people.join(", ")}`);
  if (row.action_items?.length) {
    parts.push("Action items:");
    for (const item of row.action_items) parts.push(`  - ${item}`);
  }
  parts.push(`ID: ${row.id}`);
  return parts.join("\n");
}

export async function semanticSearch(
  query: string,
  limit = 10
): Promise<string> {
  const rows = await querySemanticSearch(query, limit);

  if (!rows.length) return "No thoughts found. Your brain is empty — start capturing!";

  const results = rows.map(
    (row) => `[${Number(row.similarity).toFixed(3)}] ${formatThought(row)}`
  );
  return `Found ${rows.length} thoughts:\n\n${results.join("\n\n")}`;
}

export async function searchByPerson(
  name: string,
  limit = 10
): Promise<string> {
  const rows = await queryByPerson(name, limit);

  if (!rows.length) return `No thoughts found mentioning '${name}'.`;

  const results = rows.map(formatThought);
  return `Found ${rows.length} thoughts mentioning '${name}':\n\n${results.join("\n\n")}`;
}

export async function searchByTopic(
  topic: string,
  limit = 10
): Promise<string> {
  const rows = await queryByTopic(topic, limit);

  if (!rows.length) return `No thoughts found with topic '${topic}'.`;

  const results = rows.map(formatThought);
  return `Found ${rows.length} thoughts about '${topic}':\n\n${results.join("\n\n")}`;
}

export async function listRecent(days = 7, limit = 20): Promise<string> {
  const rows = await queryRecent(days, limit);

  if (!rows.length) return `No thoughts captured in the last ${days} days.`;

  const results = rows.map(formatThought);
  return `${rows.length} thoughts from the last ${days} days:\n\n${results.join("\n\n")}`;
}

export async function stats(days = 30): Promise<string> {
  const s = await queryStats(days);

  const parts = [
    `## Brain Stats (last ${days} days)`,
    "",
    `**Total thoughts:** ${s.total}`,
    `**Last ${days} days:** ${s.recent}`,
    `**Daily average:** ${s.dailyAvg} thoughts/day`,
    "",
  ];

  if (s.byType.length) {
    parts.push("**By type:**");
    for (const row of s.byType)
      parts.push(`  ${row.thought_type.replace(/_/g, " ")}: ${row.count}`);
    parts.push("");
  }
  if (s.topTopics.length) {
    parts.push("**Top topics:**");
    for (const row of s.topTopics) parts.push(`  ${row.topic}: ${row.count}`);
    parts.push("");
  }
  if (s.topPeople.length) {
    parts.push("**Most mentioned people:**");
    for (const row of s.topPeople) parts.push(`  ${row.person}: ${row.count}`);
  }

  return parts.join("\n");
}

export async function deleteThought(thoughtId: string): Promise<string> {
  const deleted = await removeThought(thoughtId);
  return deleted
    ? `Deleted thought ${thoughtId}.`
    : `No thought found with ID ${thoughtId}.`;
}

export async function listTasks(
  status: string = "untriaged",
  limit = 20
): Promise<string> {
  const rows = await queryThoughts({
    type: "action_item",
    status,
    limit,
  });

  if (!rows.length) return `No ${status} tasks found.`;

  const results = rows.map(formatThought);
  return `${rows.length} ${status} task(s):\n\n${results.join("\n\n")}`;
}

export async function completeTask(thoughtId: string): Promise<string> {
  const row = await updateTaskStatus(thoughtId, "completed");
  if (!row) return `No action_item found with ID ${thoughtId}.`;
  return `Completed task: ${row.raw_text}\nID: ${row.id}`;
}

export async function skipTask(thoughtId: string): Promise<string> {
  const row = await updateTaskStatus(thoughtId, "active");
  if (!row) return `No action_item found with ID ${thoughtId}.`;
  return `Skipped (moved to active): ${row.raw_text}\nID: ${row.id}`;
}

export async function untriageTask(thoughtId: string): Promise<string> {
  const row = await updateTaskStatus(thoughtId, "untriaged");
  if (!row) return `No action_item found with ID ${thoughtId}.`;
  return `Moved back to untriaged: ${row.raw_text}\nID: ${row.id}`;
}

// ── Project tools ──

export async function listProjectsTool(): Promise<string> {
  const projects = await queryProjects();
  if (!projects.length) return "No projects found.";

  const lines = projects.map((p) => {
    const count = p.thought_count ?? 0;
    const desc = p.description ? ` — ${p.description}` : "";
    return `  **${p.name}** (${p.slug}) — ${count} thoughts${desc}`;
  });
  return `${projects.length} projects:\n\n${lines.join("\n")}`;
}

export async function getProjectContext(slug: string): Promise<string> {
  const ctx = await queryProjectContext(slug);
  if (!ctx) return `No project found with slug '${slug}'.`;

  const parts: string[] = [
    `## ${ctx.project.name} — Project Context`,
    "",
  ];

  // Last milestone
  if (ctx.lastMilestone) {
    parts.push("### Last Milestone");
    parts.push(formatThought(ctx.lastMilestone));
    parts.push("");
  }

  // Open tasks
  if (ctx.openTasks.length) {
    parts.push(`### Open Tasks (${ctx.openTasks.length})`);
    for (const t of ctx.openTasks) parts.push(formatThought(t));
    parts.push("");
  } else {
    parts.push("### Open Tasks\nNone");
    parts.push("");
  }

  // Recent decisions
  if (ctx.recentDecisions.length) {
    parts.push(`### Recent Decisions (${ctx.recentDecisions.length})`);
    for (const t of ctx.recentDecisions) parts.push(formatThought(t));
    parts.push("");
  }

  // Recent insights
  if (ctx.recentInsights.length) {
    parts.push(`### Recent Insights (${ctx.recentInsights.length})`);
    for (const t of ctx.recentInsights) parts.push(formatThought(t));
    parts.push("");
  }

  // Blocking edges
  if (ctx.blockingEdges.length) {
    parts.push(`### Blocking Relationships (${ctx.blockingEdges.length})`);
    for (const e of ctx.blockingEdges) {
      parts.push(formatEdge(e));
    }
    parts.push("");
  }

  return parts.join("\n");
}

export async function assignProject(
  thoughtId: string,
  projectSlug: string
): Promise<string> {
  const row = await assignThoughtProject(thoughtId, projectSlug);
  if (!row) return `Could not assign — check thought ID and project slug.`;
  return `Assigned thought to project '${projectSlug}':\n  ${row.raw_text}\n  ID: ${row.id}`;
}

// ── Edge tools ──

function formatEdge(edge: EdgeRecord): string {
  const fromPreview = edge.from_text?.slice(0, 80) ?? edge.from_thought_id;
  const toPreview = edge.to_text?.slice(0, 80) ?? edge.to_thought_id;
  return `  [${edge.edge_type}] (weight: ${edge.weight}) ${fromPreview}... → ${toPreview}...\n  Edge ID: ${edge.id}`;
}

export async function addEdge(
  fromThoughtId: string,
  toThoughtId: string,
  edgeType: string,
  weight = 1.0
): Promise<string> {
  const edge = await insertEdge(fromThoughtId, toThoughtId, edgeType, weight);
  return `Created edge: ${edge.from_thought_id} —[${edge.edge_type}]→ ${edge.to_thought_id}\nWeight: ${edge.weight}\nEdge ID: ${edge.id}`;
}

export async function listEdges(thoughtId: string): Promise<string> {
  const edges = await queryEdgesByThought(thoughtId);
  if (!edges.length) return `No edges found for thought ${thoughtId}.`;

  const lines = edges.map(formatEdge);
  return `${edges.length} edge(s) for thought ${thoughtId}:\n\n${lines.join("\n\n")}`;
}

export async function removeEdgeTool(edgeId: string): Promise<string> {
  const deleted = await removeEdgeQuery(edgeId);
  return deleted
    ? `Deleted edge ${edgeId}.`
    : `No edge found with ID ${edgeId}.`;
}

// ── Snooze tool ──

export async function snoozeTask(
  thoughtId: string,
  days: 2 | 5 | 7
): Promise<string> {
  const result = await snoozeTaskQuery(thoughtId, days);
  if ("error" in result) return result.error;
  return `Snoozed task ${thoughtId} for ${days} days.\nWakes: ${new Date(result.snoozedUntil).toISOString().slice(0, 10)}\nSnoozes used: ${result.snoozeCount}/3 (${result.snoozesRemaining} remaining)`;
}

// ── Briefing tools ──

export async function getLatestBriefing(): Promise<string> {
  const briefing = await queryLatestBriefing();
  if (!briefing) return "No briefings generated yet.";

  const date = new Date(briefing.created_at).toISOString().slice(0, 16).replace("T", " ");
  return `**Morning Briefing** — ${date}\n\n${briefing.content}\n\n---\n_Model: ${briefing.model} | Cost: $${briefing.cost_usd} | Thoughts analyzed: ${briefing.thought_count}_`;
}

export async function listBriefings(limit = 5): Promise<string> {
  const briefings = await queryBriefings(limit);
  if (!briefings.length) return "No briefings generated yet.";

  const lines = briefings.map((b) => {
    const date = new Date(b.created_at).toISOString().slice(0, 10);
    return `- **${date}** — ${b.thought_count} thoughts, $${b.cost_usd} | ID: ${b.id}`;
  });
  return `${briefings.length} briefing(s):\n\n${lines.join("\n")}`;
}
