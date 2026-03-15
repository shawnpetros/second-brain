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
  type ThoughtRecord,
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
