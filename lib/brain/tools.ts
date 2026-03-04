import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { generateEmbedding } from "./embeddings";
import { extractMetadata } from "./metadata";

function sql() {
  return neon(env.DATABASE_URL);
}

interface ThoughtRow {
  id: string;
  raw_text: string;
  thought_type: string;
  people: string[];
  topics: string[];
  action_items: string[];
  created_at: string;
  similarity?: number;
}

function formatThought(row: ThoughtRow): string {
  const type = row.thought_type.replace(/_/g, " ");
  const date = new Date(row.created_at).toISOString().slice(0, 16).replace("T", " ");
  const parts = [
    `**${type.charAt(0).toUpperCase() + type.slice(1)}** — ${date}`,
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

export async function capture(text: string, source = "mcp"): Promise<string> {
  const [embedding, metadata] = await Promise.all([
    generateEmbedding(text),
    extractMetadata(text),
  ]);

  const rows = await sql()`
    INSERT INTO thoughts (raw_text, embedding, thought_type, people, topics, action_items, source)
    VALUES (${text}, ${JSON.stringify(embedding)}::vector, ${metadata.thought_type}, ${metadata.people}, ${metadata.topics}, ${metadata.action_items}, ${source})
    RETURNING id, thought_type, people, topics, action_items, created_at
  `;
  const row = rows[0];

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
  const embedding = await generateEmbedding(query);
  const embeddingStr = JSON.stringify(embedding);

  const rows = (await sql()`
    SELECT id, raw_text, thought_type, people, topics, action_items,
           created_at, 1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM thoughts
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `) as ThoughtRow[];

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
  const rows = (await sql()`
    SELECT id, raw_text, thought_type, people, topics, action_items, created_at
    FROM thoughts
    WHERE EXISTS (
      SELECT 1 FROM unnest(people) p WHERE lower(p) LIKE lower(${"%" + name + "%"})
    )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as ThoughtRow[];

  if (!rows.length) return `No thoughts found mentioning '${name}'.`;

  const results = rows.map(formatThought);
  return `Found ${rows.length} thoughts mentioning '${name}':\n\n${results.join("\n\n")}`;
}

export async function searchByTopic(
  topic: string,
  limit = 10
): Promise<string> {
  const rows = (await sql()`
    SELECT id, raw_text, thought_type, people, topics, action_items, created_at
    FROM thoughts
    WHERE EXISTS (
      SELECT 1 FROM unnest(topics) t WHERE lower(t) LIKE lower(${"%" + topic + "%"})
    )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as ThoughtRow[];

  if (!rows.length) return `No thoughts found with topic '${topic}'.`;

  const results = rows.map(formatThought);
  return `Found ${rows.length} thoughts about '${topic}':\n\n${results.join("\n\n")}`;
}

export async function listRecent(days = 7, limit = 20): Promise<string> {
  const rows = (await sql()`
    SELECT id, raw_text, thought_type, people, topics, action_items, created_at
    FROM thoughts
    WHERE created_at > now() - make_interval(days => ${days})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as ThoughtRow[];

  if (!rows.length) return `No thoughts captured in the last ${days} days.`;

  const results = rows.map(formatThought);
  return `${rows.length} thoughts from the last ${days} days:\n\n${results.join("\n\n")}`;
}

export async function stats(days = 30): Promise<string> {
  const db = sql();

  const [totalRows, recentRows, typeRows, topicRows, peopleRows, avgRows] =
    await Promise.all([
      db`SELECT count(*) as total FROM thoughts`,
      db`SELECT count(*) as recent FROM thoughts WHERE created_at > now() - make_interval(days => ${days})`,
      db`
        SELECT thought_type, count(*) as cnt
        FROM thoughts
        WHERE created_at > now() - make_interval(days => ${days})
        GROUP BY thought_type ORDER BY cnt DESC
      `,
      db`
        SELECT t as topic, count(*) as cnt
        FROM thoughts, unnest(topics) t
        WHERE created_at > now() - make_interval(days => ${days})
        GROUP BY t ORDER BY cnt DESC LIMIT 15
      `,
      db`
        SELECT p as person, count(*) as cnt
        FROM thoughts, unnest(people) p
        WHERE created_at > now() - make_interval(days => ${days})
        GROUP BY p ORDER BY cnt DESC LIMIT 10
      `,
      db`
        SELECT count(*)::float / GREATEST(
          EXTRACT(DAY FROM now() - min(created_at)), 1
        ) as daily_avg
        FROM thoughts
        WHERE created_at > now() - make_interval(days => ${days})
      `,
    ]);

  const total = totalRows[0].total;
  const recent = recentRows[0].recent;
  const dailyAvg = Number(avgRows[0].daily_avg || 0).toFixed(1);

  const parts = [
    `## Brain Stats (last ${days} days)`,
    "",
    `**Total thoughts:** ${total}`,
    `**Last ${days} days:** ${recent}`,
    `**Daily average:** ${dailyAvg} thoughts/day`,
    "",
  ];

  if (typeRows.length) {
    parts.push("**By type:**");
    for (const row of typeRows)
      parts.push(`  ${row.thought_type.replace(/_/g, " ")}: ${row.cnt}`);
    parts.push("");
  }
  if (topicRows.length) {
    parts.push("**Top topics:**");
    for (const row of topicRows) parts.push(`  ${row.topic}: ${row.cnt}`);
    parts.push("");
  }
  if (peopleRows.length) {
    parts.push("**Most mentioned people:**");
    for (const row of peopleRows) parts.push(`  ${row.person}: ${row.cnt}`);
  }

  return parts.join("\n");
}

export async function deleteThought(thoughtId: string): Promise<string> {
  const rows = await sql()`
    DELETE FROM thoughts WHERE id = ${thoughtId} RETURNING id
  `;
  return rows.length
    ? `Deleted thought ${thoughtId}.`
    : `No thought found with ID ${thoughtId}.`;
}
