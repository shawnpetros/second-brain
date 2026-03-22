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

export interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  repo_path: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  thought_count?: number;
}

export interface EdgeRecord {
  id: string;
  from_thought_id: string;
  to_thought_id: string;
  edge_type: string;
  weight: string;
  created_at: string;
  from_text?: string;
  to_text?: string;
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
  source = "dashboard",
  thoughtTypeHint?: string
): Promise<ThoughtRecord> {
  const [embedding, metadata] = await Promise.all([
    generateEmbedding(text),
    extractMetadata(text),
  ]);

  const thoughtType = thoughtTypeHint || metadata.thought_type;
  const status = thoughtType === "action_item" ? "untriaged" : "active";

  const rows = await sql()`
    INSERT INTO thoughts (raw_text, embedding, thought_type, people, topics, action_items, source, status, deadline)
    VALUES (${text}, ${JSON.stringify(embedding)}::vector, ${thoughtType}, ${metadata.people}, ${metadata.topics}, ${metadata.action_items}, ${source}, ${status}, ${metadata.deadline})
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

// ── Projects ──

export async function queryProjects(): Promise<ProjectRecord[]> {
  const rows = await sql()`
    SELECT p.id, p.name, p.slug, p.repo_path, p.description, p.created_at, p.updated_at,
           COUNT(t.id)::int as thought_count
    FROM projects p
    LEFT JOIN thoughts t ON t.project_id = p.id
    GROUP BY p.id
    ORDER BY thought_count DESC
  `;
  return rows as ProjectRecord[];
}

export async function queryProjectBySlug(slug: string): Promise<ProjectRecord | null> {
  const rows = await sql()`
    SELECT id, name, slug, repo_path, description, created_at, updated_at
    FROM projects WHERE slug = ${slug}
  `;
  return (rows[0] as ProjectRecord) ?? null;
}

export async function queryProjectContext(slug: string): Promise<{
  project: ProjectRecord;
  openTasks: ThoughtRecord[];
  recentDecisions: ThoughtRecord[];
  lastMilestone: ThoughtRecord | null;
  recentInsights: ThoughtRecord[];
  blockingEdges: EdgeRecord[];
} | null> {
  const project = await queryProjectBySlug(slug);
  if (!project) return null;

  const db = sql();
  const [tasks, decisions, milestones, insights, blocks] = await Promise.all([
    db`
      SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
      FROM thoughts
      WHERE project_id = ${project.id} AND thought_type = 'action_item' AND status IN ('untriaged', 'active')
      ORDER BY created_at DESC LIMIT 10
    `,
    db`
      SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
      FROM thoughts
      WHERE project_id = ${project.id} AND thought_type = 'decision'
      ORDER BY created_at DESC LIMIT 5
    `,
    db`
      SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
      FROM thoughts
      WHERE project_id = ${project.id} AND thought_type = 'milestone'
      ORDER BY created_at DESC LIMIT 1
    `,
    db`
      SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
      FROM thoughts
      WHERE project_id = ${project.id} AND thought_type = 'insight'
      ORDER BY created_at DESC LIMIT 5
    `,
    db`
      SELECT e.id, e.from_thought_id, e.to_thought_id, e.edge_type, e.weight, e.created_at,
        t_from.raw_text as from_text,
        t_to.raw_text as to_text
      FROM thought_edges e
      JOIN thoughts t_from ON t_from.id = e.from_thought_id
      JOIN thoughts t_to ON t_to.id = e.to_thought_id
      WHERE e.edge_type = 'blocks'
        AND (t_from.project_id = ${project.id} OR t_to.project_id = ${project.id})
      ORDER BY e.created_at DESC LIMIT 10
    `,
  ]);

  return {
    project,
    openTasks: tasks as ThoughtRecord[],
    recentDecisions: decisions as ThoughtRecord[],
    lastMilestone: (milestones[0] as ThoughtRecord) ?? null,
    recentInsights: insights as ThoughtRecord[],
    blockingEdges: blocks as EdgeRecord[],
  };
}

export async function queryProjectByRepoPath(repoPath: string): Promise<ProjectRecord | null> {
  // Try exact match first, then match by directory basename
  const rows = await sql()`
    SELECT id, name, slug, repo_path, description, created_at, updated_at
    FROM projects
    WHERE repo_path = ${repoPath}
    LIMIT 1
  `;
  if (rows[0]) return rows[0] as ProjectRecord;

  // Fallback: match directory basename against slug
  const basename = repoPath.split("/").pop() || "";
  const slugified = basename.replace(/\./g, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const fallback = await sql()`
    SELECT id, name, slug, repo_path, description, created_at, updated_at
    FROM projects
    WHERE slug = ${slugified} OR slug = ${basename}
    LIMIT 1
  `;
  return (fallback[0] as ProjectRecord) ?? null;
}

export async function assignThoughtProject(
  thoughtId: string,
  projectSlug: string
): Promise<ThoughtRecord | null> {
  const project = await queryProjectBySlug(projectSlug);
  if (!project) return null;

  const rows = await sql()`
    UPDATE thoughts SET project_id = ${project.id}
    WHERE id = ${thoughtId}
    RETURNING id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
  `;
  return (rows[0] as ThoughtRecord) ?? null;
}

// ── Edges ──

export async function insertEdge(
  fromThoughtId: string,
  toThoughtId: string,
  edgeType: string,
  weight = 1.0
): Promise<EdgeRecord> {
  const rows = await sql()`
    INSERT INTO thought_edges (from_thought_id, to_thought_id, edge_type, weight)
    VALUES (${fromThoughtId}, ${toThoughtId}, ${edgeType}, ${weight})
    ON CONFLICT (from_thought_id, to_thought_id, edge_type) DO UPDATE SET weight = ${weight}
    RETURNING id, from_thought_id, to_thought_id, edge_type, weight, created_at
  `;
  return rows[0] as EdgeRecord;
}

export async function queryEdgesByThought(thoughtId: string): Promise<EdgeRecord[]> {
  const rows = await sql()`
    SELECT e.id, e.from_thought_id, e.to_thought_id, e.edge_type, e.weight, e.created_at,
      t_from.raw_text as from_text,
      t_to.raw_text as to_text
    FROM thought_edges e
    JOIN thoughts t_from ON t_from.id = e.from_thought_id
    JOIN thoughts t_to ON t_to.id = e.to_thought_id
    WHERE e.from_thought_id = ${thoughtId} OR e.to_thought_id = ${thoughtId}
    ORDER BY e.weight DESC, e.created_at DESC
  `;
  return rows as EdgeRecord[];
}

export async function removeEdge(id: string): Promise<boolean> {
  const rows = await sql()`
    DELETE FROM thought_edges WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

// ── Briefings ──

export interface BriefingRecord {
  id: string;
  content: string;
  raw_data: Record<string, unknown>;
  model: string;
  cost_usd: string | null;
  tokens_used: number | null;
  thought_count: number;
  created_at: string;
}

export async function insertBriefing(data: {
  content: string;
  rawData: Record<string, unknown>;
  model: string;
  costUsd: number;
  tokensUsed: number;
  thoughtCount: number;
}): Promise<BriefingRecord> {
  const rows = await sql()`
    INSERT INTO briefings (content, raw_data, model, cost_usd, tokens_used, thought_count)
    VALUES (${data.content}, ${JSON.stringify(data.rawData)}, ${data.model}, ${data.costUsd}, ${data.tokensUsed}, ${data.thoughtCount})
    RETURNING *
  `;
  return rows[0] as BriefingRecord;
}

export async function queryLatestBriefing(): Promise<BriefingRecord | null> {
  const rows = await sql()`
    SELECT * FROM briefings ORDER BY created_at DESC LIMIT 1
  `;
  return (rows[0] as BriefingRecord) ?? null;
}

export async function queryBriefings(limit = 10): Promise<BriefingRecord[]> {
  const rows = await sql()`
    SELECT * FROM briefings ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as BriefingRecord[];
}

// ── Pending Actions ──

export interface PendingActionRecord {
  id: string;
  thought_id: string;
  briefing_id: string | null;
  action_type: string;
  permission_tier: "auto" | "staged" | "never";
  status: string;
  stakes: string | null;
  model_used: string | null;
  prompt_summary: string;
  prompt_adjustments: string | null;
  result: string | null;
  result_metadata: Record<string, unknown>;
  urgency_score: number;
  expires_at: string;
  reviewed_at: string | null;
  retry_count: number;
  failure_reason: string | null;
  parent_action_id: string | null;
  flagged: boolean;
  flag_reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function insertPendingAction(data: {
  thoughtId: string;
  briefingId?: string;
  actionType: string;
  permissionTier: "auto" | "staged" | "never";
  stakes?: "low" | "medium" | "high";
  promptSummary: string;
  urgencyScore?: number;
}): Promise<PendingActionRecord> {
  const rows = await sql()`
    INSERT INTO pending_actions (thought_id, briefing_id, action_type, permission_tier, stakes, prompt_summary, urgency_score)
    VALUES (${data.thoughtId}, ${data.briefingId ?? null}, ${data.actionType}, ${data.permissionTier}, ${data.stakes ?? null}, ${data.promptSummary}, ${data.urgencyScore ?? 0})
    RETURNING *
  `;
  return rows[0] as PendingActionRecord;
}

export async function queryPendingActions(filters: {
  status?: string;
  permissionTier?: string;
  limit?: number;
}): Promise<PendingActionRecord[]> {
  const { status, permissionTier, limit = 20 } = filters;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }
  if (permissionTier) {
    conditions.push(`permission_tier = $${paramIdx++}`);
    params.push(permissionTier);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await sql()(
    `SELECT * FROM pending_actions ${where}
     ORDER BY urgency_score DESC, created_at DESC
     LIMIT $${paramIdx++}`,
    [...params, limit]
  );
  return rows as PendingActionRecord[];
}

export async function queryPendingActionById(id: string): Promise<PendingActionRecord | null> {
  const rows = await sql()`
    SELECT * FROM pending_actions WHERE id = ${id}
  `;
  return (rows[0] as PendingActionRecord) ?? null;
}

export async function queryPendingActionsByThought(thoughtId: string): Promise<PendingActionRecord[]> {
  const rows = await sql()`
    SELECT * FROM pending_actions WHERE thought_id = ${thoughtId}
    ORDER BY created_at DESC
  `;
  return rows as PendingActionRecord[];
}

export async function updatePendingActionStatus(
  id: string,
  status: string,
  extra?: { result?: string; resultMetadata?: Record<string, unknown>; modelUsed?: string; failureReason?: string }
): Promise<PendingActionRecord | null> {
  const setClauses = ["status = $2"];
  const params: unknown[] = [id, status];
  let paramIdx = 3;

  if (status === "approved" || status === "rejected") {
    setClauses.push(`reviewed_at = now()`);
  }
  if (extra?.result !== undefined) {
    setClauses.push(`result = $${paramIdx++}`);
    params.push(extra.result);
  }
  if (extra?.resultMetadata !== undefined) {
    setClauses.push(`result_metadata = $${paramIdx++}`);
    params.push(JSON.stringify(extra.resultMetadata));
  }
  if (extra?.modelUsed !== undefined) {
    setClauses.push(`model_used = $${paramIdx++}`);
    params.push(extra.modelUsed);
  }
  if (extra?.failureReason !== undefined) {
    setClauses.push(`failure_reason = $${paramIdx++}`);
    params.push(extra.failureReason);
    setClauses.push(`retry_count = retry_count + 1`);
  }

  const rows = await sql()(
    `UPDATE pending_actions SET ${setClauses.join(", ")}
     WHERE id = $1 RETURNING *`,
    params
  );
  return (rows[0] as PendingActionRecord) ?? null;
}

export async function flagPendingAction(
  id: string,
  reason?: string
): Promise<PendingActionRecord | null> {
  const rows = await sql()`
    UPDATE pending_actions SET flagged = true, flag_reason = ${reason ?? null}
    WHERE id = ${id} RETURNING *
  `;
  return (rows[0] as PendingActionRecord) ?? null;
}

export async function queryActionTypeHealth(
  actionType: string,
  days = 30
): Promise<{ total: number; flagged: number; flagRate: number }> {
  const rows = await sql()`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('staged', 'approved', 'rejected', 'dismissed')) as total,
      COUNT(*) FILTER (WHERE flagged = true) as flagged
    FROM pending_actions
    WHERE action_type = ${actionType}
      AND created_at > now() - make_interval(days => ${days})
  `;
  const total = Number(rows[0].total);
  const flagged = Number(rows[0].flagged);
  return { total, flagged, flagRate: total > 0 ? flagged / total : 0 };
}

export async function queryFailedActions(limit = 5): Promise<PendingActionRecord[]> {
  const rows = await sql()`
    SELECT * FROM pending_actions
    WHERE status = 'failed' AND retry_count < 2
    ORDER BY urgency_score DESC, created_at DESC
    LIMIT ${limit}
  `;
  return rows as PendingActionRecord[];
}

// ── Snooze ──

export async function snoozeTask(
  id: string,
  days: 2 | 5 | 7
): Promise<{ snoozedUntil: string; snoozeCount: number; snoozesRemaining: number } | { error: string }> {
  // Check current snooze count
  const check = await sql()`
    SELECT snooze_count FROM thoughts WHERE id = ${id} AND thought_type = 'action_item'
  `;
  if (!check.length) return { error: `No action_item found with ID ${id}.` };

  const currentCount = Number(check[0].snooze_count ?? 0);
  if (currentCount >= 3) {
    return { error: "This task has been snoozed 3 times. Complete it, delete it, or work on it." };
  }

  const rows = await sql()`
    UPDATE thoughts SET
      snoozed_until = now() + make_interval(days => ${days}),
      snooze_count = snooze_count + 1,
      action_classification = NULL
    WHERE id = ${id} AND thought_type = 'action_item'
    RETURNING snoozed_until, snooze_count
  `;
  if (!rows.length) return { error: `Failed to snooze task ${id}.` };

  const newCount = Number(rows[0].snooze_count);
  return {
    snoozedUntil: rows[0].snoozed_until as string,
    snoozeCount: newCount,
    snoozesRemaining: 3 - newCount,
  };
}

// ── Urgency Score Updates ──

export async function updateThoughtUrgency(
  id: string,
  urgencyScore: number,
  actionClassification?: string
): Promise<void> {
  if (actionClassification) {
    await sql()`
      UPDATE thoughts SET
        urgency_score = ${urgencyScore},
        urgency_updated_at = now(),
        action_classification = ${actionClassification}
      WHERE id = ${id}
    `;
  } else {
    await sql()`
      UPDATE thoughts SET
        urgency_score = ${urgencyScore},
        urgency_updated_at = now()
      WHERE id = ${id}
    `;
  }
}

export async function updateThoughtDeadline(
  id: string,
  deadline: string
): Promise<void> {
  await sql()`
    UPDATE thoughts SET deadline = ${deadline} WHERE id = ${id}
  `;
}

// ── Permission Overrides ──

export async function queryPermissionOverrides(): Promise<Record<string, string>> {
  const rows = await sql()`
    SELECT action_type, override_tier FROM permission_overrides
  `;
  const overrides: Record<string, string> = {};
  for (const row of rows) {
    overrides[row.action_type as string] = row.override_tier as string;
  }
  return overrides;
}

export async function insertPermissionOverride(
  actionType: string,
  overrideTier: "auto" | "staged",
  reason?: string
): Promise<void> {
  await sql()`
    INSERT INTO permission_overrides (action_type, override_tier, reason)
    VALUES (${actionType}, ${overrideTier}, ${reason ?? null})
    ON CONFLICT (action_type) DO UPDATE SET override_tier = ${overrideTier}, reason = ${reason ?? null}
  `;
}

export async function removePermissionOverride(actionType: string): Promise<boolean> {
  const rows = await sql()`
    DELETE FROM permission_overrides WHERE action_type = ${actionType} RETURNING id
  `;
  return rows.length > 0;
}

// ── Briefings (existing, enhanced) ──

export async function gatherBriefingData(): Promise<{
  recentThoughts: ThoughtRecord[];
  openTasks: ThoughtRecord[];
  staleTasks: ThoughtRecord[];
  unactedDecisions: ThoughtRecord[];
  dormantIdeas: ThoughtRecord[];
  projectSummaries: { slug: string; name: string; thought_count: number }[];
  alerts: AlertItem[];
  newEdges: EdgeRecord[];
}> {
  const db = sql();

  const [recent, tasks, stale, decisions, ideas, projects, alertData, edges] = await Promise.all([
    // Thoughts from last 24h
    db`
      SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
      FROM thoughts
      WHERE created_at > now() - interval '24 hours'
      ORDER BY created_at DESC
      LIMIT 50
    `,
    // Open tasks (untriaged + active)
    db`
      SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
      FROM thoughts
      WHERE thought_type = 'action_item' AND status IN ('untriaged', 'active')
      ORDER BY created_at DESC
      LIMIT 30
    `,
    // Stale tasks — active for 7+ days without update, or untriaged for 3+ days
    db`
      SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at,
        EXTRACT(DAY FROM now() - COALESCE(updated_at, created_at))::int as days_stale
      FROM thoughts
      WHERE thought_type = 'action_item'
        AND ((status = 'active' AND updated_at < now() - interval '7 days')
          OR (status = 'untriaged' AND created_at < now() - interval '3 days'))
      ORDER BY created_at ASC
      LIMIT 15
    `,
    // Decisions from last 14 days — check for unacted-on ones
    db`
      SELECT id, raw_text, thought_type, status, people, topics, action_items, source, created_at, updated_at
      FROM thoughts
      WHERE thought_type = 'decision'
        AND created_at > now() - interval '14 days'
      ORDER BY created_at DESC
      LIMIT 10
    `,
    // Ideas captured but never developed (no edges, no follow-up, 7+ days old)
    db`
      SELECT t.id, t.raw_text, t.thought_type, t.status, t.people, t.topics, t.action_items, t.source, t.created_at, t.updated_at
      FROM thoughts t
      LEFT JOIN thought_edges e ON e.from_thought_id = t.id OR e.to_thought_id = t.id
      WHERE t.thought_type = 'idea'
        AND t.created_at < now() - interval '7 days'
        AND e.id IS NULL
      ORDER BY t.created_at DESC
      LIMIT 10
    `,
    // Project summaries with recent thought counts
    db`
      SELECT p.slug, p.name, COUNT(t.id)::int as thought_count
      FROM projects p
      LEFT JOIN thoughts t ON t.project_id = p.id AND t.created_at > now() - interval '24 hours'
      GROUP BY p.id
      HAVING COUNT(t.id) > 0
      ORDER BY thought_count DESC
    `,
    // Alerts
    queryAlerts(),
    // New edges from last 24h
    db`
      SELECT e.id, e.from_thought_id, e.to_thought_id, e.edge_type, e.weight, e.created_at,
        t_from.raw_text as from_text, t_to.raw_text as to_text
      FROM thought_edges e
      JOIN thoughts t_from ON t_from.id = e.from_thought_id
      JOIN thoughts t_to ON t_to.id = e.to_thought_id
      WHERE e.created_at > now() - interval '24 hours'
      ORDER BY e.created_at DESC
      LIMIT 20
    `,
  ]);

  return {
    recentThoughts: recent as ThoughtRecord[],
    openTasks: tasks as ThoughtRecord[],
    staleTasks: stale as ThoughtRecord[],
    unactedDecisions: decisions as ThoughtRecord[],
    dormantIdeas: ideas as ThoughtRecord[],
    projectSummaries: projects as { slug: string; name: string; thought_count: number }[],
    alerts: alertData,
    newEdges: edges as EdgeRecord[],
  };
}
