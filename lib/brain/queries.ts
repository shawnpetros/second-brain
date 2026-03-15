import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { generateEmbedding } from "./embeddings";
import { extractMetadata } from "./metadata";

function sql() {
  return neon(env.DATABASE_URL);
}

export interface ThoughtRecord {
  id: string;
  raw_text: string;
  thought_type: string;
  status: string;
  people: string[];
  topics: string[];
  action_items: string[];
  source: string;
  created_at: string;
  updated_at: string;
  similarity?: number;
}

export interface BrainStats {
  total: number;
  recent: number;
  dailyAvg: number;
  byType: { thought_type: string; count: number }[];
  topTopics: { topic: string; count: number }[];
  topPeople: { person: string; count: number }[];
  openTasks: number;
}

export interface AlertItem {
  type: "aging_untriaged" | "stale_active" | "relationship_decay";
  title: string;
  description: string;
  thought_id?: string;
  person?: string;
  age_days: number;
}

// ── Core Queries ──

export async function queryThoughts(filters: {
  type?: string;
  topic?: string;
  person?: string;
  status?: string;
  days?: number;
  limit?: number;
  offset?: number;
}): Promise<ThoughtRecord[]> {
  const { type, topic, person, status, days, limit = 50, offset = 0 } = filters;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (type) {
    conditions.push(`thought_type = $${paramIdx++}`);
    params.push(type);
  }
  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }
  if (days) {
    conditions.push(`created_at > now() - make_interval(days => $${paramIdx++})`);
    params.push(days);
  }
  if (topic) {
    conditions.push(`EXISTS (SELECT 1 FROM unnest(topics) t WHERE lower(t) LIKE lower($${paramIdx++}))`);
    params.push(`%${topic}%`);
  }
  if (person) {
    conditions.push(`EXISTS (SELECT 1 FROM unnest(people) p WHERE lower(p) LIKE lower($${paramIdx++}))`);
    params.push(`%${person}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await sql()(
    `SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
     FROM thoughts ${where}
     ORDER BY created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  return rows as ThoughtRecord[];
}

export async function queryThoughtById(id: string): Promise<ThoughtRecord | null> {
  const rows = await sql()`
    SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
    FROM thoughts WHERE id = ${id}
  `;
  return (rows[0] as ThoughtRecord) ?? null;
}

export async function querySemanticSearch(
  query: string,
  limit = 10
): Promise<ThoughtRecord[]> {
  const embedding = await generateEmbedding(query);
  const embeddingStr = JSON.stringify(embedding);

  const rows = await sql()`
    SELECT id, raw_text, thought_type, status, people, topics, action_items, source,
           created_at, updated_at, 1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM thoughts
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  return rows as ThoughtRecord[];
}

export async function queryByPerson(
  name: string,
  limit = 10
): Promise<ThoughtRecord[]> {
  const rows = await sql()`
    SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
    FROM thoughts
    WHERE EXISTS (
      SELECT 1 FROM unnest(people) p WHERE lower(p) LIKE lower(${"%" + name + "%"})
    )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as ThoughtRecord[];
}

export async function queryByTopic(
  topic: string,
  limit = 10
): Promise<ThoughtRecord[]> {
  const rows = await sql()`
    SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
    FROM thoughts
    WHERE EXISTS (
      SELECT 1 FROM unnest(topics) t WHERE lower(t) LIKE lower(${"%" + topic + "%"})
    )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as ThoughtRecord[];
}

export async function queryRecent(
  days = 7,
  limit = 20
): Promise<ThoughtRecord[]> {
  const rows = await sql()`
    SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
    FROM thoughts
    WHERE created_at > now() - make_interval(days => ${days})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as ThoughtRecord[];
}

export async function queryStats(days = 30): Promise<BrainStats> {
  const db = sql();

  const [totalRows, recentRows, typeRows, topicRows, peopleRows, avgRows, taskRows] =
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
      db`SELECT count(*) as cnt FROM thoughts WHERE thought_type = 'action_item' AND status IN ('untriaged', 'active')`,
    ]);

  return {
    total: Number(totalRows[0].total),
    recent: Number(recentRows[0].recent),
    dailyAvg: Number(Number(avgRows[0].daily_avg || 0).toFixed(1)),
    byType: typeRows.map((r) => ({ thought_type: r.thought_type as string, count: Number(r.cnt) })),
    topTopics: topicRows.map((r) => ({ topic: r.topic as string, count: Number(r.cnt) })),
    topPeople: peopleRows.map((r) => ({ person: r.person as string, count: Number(r.cnt) })),
    openTasks: Number(taskRows[0].cnt),
  };
}

// ── Mutations ──

export async function insertThought(
  text: string,
  source = "dashboard"
): Promise<ThoughtRecord> {
  const [embedding, metadata] = await Promise.all([
    generateEmbedding(text),
    extractMetadata(text),
  ]);

  const status = metadata.thought_type === "action_item" ? "untriaged" : "active";

  const rows = await sql()`
    INSERT INTO thoughts (raw_text, embedding, thought_type, people, topics, action_items, source, status)
    VALUES (${text}, ${JSON.stringify(embedding)}::vector, ${metadata.thought_type}, ${metadata.people}, ${metadata.topics}, ${metadata.action_items}, ${source}, ${status})
    RETURNING id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
  `;
  return rows[0] as ThoughtRecord;
}

export async function updateThought(
  id: string,
  updates: { raw_text?: string; status?: string }
): Promise<ThoughtRecord | null> {
  if (updates.raw_text) {
    // Re-extract metadata when text changes
    const [embedding, metadata] = await Promise.all([
      generateEmbedding(updates.raw_text),
      extractMetadata(updates.raw_text),
    ]);

    const newStatus = updates.status ?? (metadata.thought_type === "action_item" ? undefined : undefined);

    const setClauses = [
      "raw_text = $2",
      "embedding = $3::vector",
      "thought_type = $4",
      "people = $5",
      "topics = $6",
      "action_items = $7",
    ];
    const params: unknown[] = [
      id,
      updates.raw_text,
      JSON.stringify(embedding),
      metadata.thought_type,
      metadata.people,
      metadata.topics,
      metadata.action_items,
    ];
    let paramIdx = 8;

    if (newStatus || updates.status) {
      setClauses.push(`status = $${paramIdx++}`);
      params.push(updates.status || newStatus);
    }

    const rows = await sql()(
      `UPDATE thoughts SET ${setClauses.join(", ")}
       WHERE id = $1
       RETURNING id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at`,
      params
    );
    return (rows[0] as ThoughtRecord) ?? null;
  }

  if (updates.status) {
    const rows = await sql()`
      UPDATE thoughts SET status = ${updates.status}
      WHERE id = ${id}
      RETURNING id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
    `;
    return (rows[0] as ThoughtRecord) ?? null;
  }

  return null;
}

export async function removeThought(id: string): Promise<boolean> {
  const rows = await sql()`
    DELETE FROM thoughts WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

export async function updateTaskStatus(
  id: string,
  status: "untriaged" | "active" | "completed" | "skipped"
): Promise<ThoughtRecord | null> {
  const rows = await sql()`
    UPDATE thoughts SET status = ${status}
    WHERE id = ${id} AND thought_type = 'action_item'
    RETURNING id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
  `;
  return (rows[0] as ThoughtRecord) ?? null;
}

// ── Alerts (feat-104) ──

export async function queryAlerts(): Promise<AlertItem[]> {
  const db = sql();
  const alerts: AlertItem[] = [];

  const [agingRows, staleRows, decayRows] = await Promise.all([
    // Aging untriaged tasks (> 3 days old)
    db`
      SELECT id, raw_text, EXTRACT(DAY FROM now() - created_at)::int as age_days
      FROM thoughts
      WHERE thought_type = 'action_item' AND status = 'untriaged'
        AND created_at < now() - interval '3 days'
      ORDER BY created_at ASC
      LIMIT 10
    `,
    // Stale active tasks (not updated in 14+ days)
    db`
      SELECT id, raw_text, EXTRACT(DAY FROM now() - updated_at)::int as age_days
      FROM thoughts
      WHERE thought_type = 'action_item' AND status = 'active'
        AND updated_at < now() - interval '14 days'
      ORDER BY updated_at ASC
      LIMIT 10
    `,
    // Relationship decay (people not mentioned in 30+ days)
    db`
      SELECT p as person, max(created_at) as last_mention,
             EXTRACT(DAY FROM now() - max(created_at))::int as age_days
      FROM thoughts, unnest(people) p
      GROUP BY p
      HAVING max(created_at) < now() - interval '30 days'
      ORDER BY max(created_at) ASC
      LIMIT 10
    `,
  ]);

  for (const row of agingRows) {
    alerts.push({
      type: "aging_untriaged",
      title: "Untriaged task aging",
      description: row.raw_text as string,
      thought_id: row.id as string,
      age_days: Number(row.age_days),
    });
  }

  for (const row of staleRows) {
    alerts.push({
      type: "stale_active",
      title: "Stale active task",
      description: row.raw_text as string,
      thought_id: row.id as string,
      age_days: Number(row.age_days),
    });
  }

  for (const row of decayRows) {
    alerts.push({
      type: "relationship_decay",
      title: "Relationship fading",
      description: `Haven't mentioned ${row.person} in ${row.age_days} days`,
      person: row.person as string,
      age_days: Number(row.age_days),
    });
  }

  return alerts;
}
