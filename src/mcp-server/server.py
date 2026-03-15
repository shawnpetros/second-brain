"""
Open Brain MCP Server

A local MCP server that provides semantic search, capture, and management
of a personal knowledge base stored in Postgres with pgvector.

Connects to Neon Postgres directly. Generates embeddings via OpenAI.
Extracts metadata via GPT-4o-mini.
"""

import json
import logging
import os
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from openai import OpenAI

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("open-brain")

# --- Config ---

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
EMBEDDING_MODEL = "text-embedding-3-small"
EXTRACTION_MODEL = "gpt-4o-mini"
EMBEDDING_DIMS = 1536

# --- Clients ---

openai_client = OpenAI(api_key=OPENAI_API_KEY)
mcp = FastMCP("open-brain")

# --- Helpers ---

VALID_TYPES = [
    "decision", "insight", "meeting", "person_note",
    "idea", "action_item", "reflection", "reference", "milestone",
]

EXTRACTION_SYSTEM_PROMPT = """You are a metadata extraction assistant. Given a thought or note, extract structured metadata.

Respond with ONLY valid JSON matching this schema:
{
  "thought_type": one of ["decision", "insight", "meeting", "person_note", "idea", "action_item", "reflection", "reference", "milestone"],
  "people": [list of people mentioned by name, empty array if none],
  "topics": [2-5 topic keywords that capture the subject matter],
  "action_items": [list of action items if any, empty array if none]
}

Guidelines:
- "decision": the person made or is considering a choice
- "insight": a realization, observation, or learned lesson
- "meeting": notes from a conversation or meeting
- "person_note": information about a specific person
- "idea": a concept, proposal, or creative thought
- "action_item": a task or todo — something that needs to be DONE. Do NOT use this for summaries of completed work
- "reflection": personal thinking, journaling, self-assessment
- "reference": factual information, links, resources to remember
- "milestone": a session summary, project accomplishment, shipped feature, or win. Use this for recaps of what was built/achieved/completed — NOT for tasks that still need doing
- Extract ONLY names that are clearly people (not companies, products, etc.)
- Topics should be 1-3 word phrases, lowercase
"""


def get_db():
    """Get a database connection."""
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    conn.autocommit = True
    return conn


def generate_embedding(text: str) -> list[float]:
    """Generate a vector embedding for the given text."""
    response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


def extract_metadata(text: str) -> dict:
    """Extract structured metadata from text using an LLM."""
    response = openai_client.chat.completions.create(
        model=EXTRACTION_MODEL,
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    result = json.loads(response.choices[0].message.content)

    # Validate and sanitize
    if result.get("thought_type") not in VALID_TYPES:
        result["thought_type"] = "reflection"
    result.setdefault("people", [])
    result.setdefault("topics", [])
    result.setdefault("action_items", [])

    return result


VALID_STATUSES = ["untriaged", "active", "completed", "skipped"]


def format_thought(row: dict) -> str:
    """Format a thought row for display."""
    status = row.get("status", "untriaged")
    status_label = f" [{status}]" if status and status != "untriaged" else ""
    parts = [
        f"**{row['thought_type'].replace('_', ' ').title()}**{status_label} — {row['created_at'].strftime('%Y-%m-%d %H:%M')}",
        f"  {row['raw_text']}",
    ]
    if row.get("people"):
        parts.append(f"  People: {', '.join(row['people'])}")
    if row.get("topics"):
        parts.append(f"  Topics: {', '.join(row['topics'])}")
    if row.get("action_items"):
        for item in row["action_items"]:
            parts.append(f"  - [ ] {item}")
    parts.append(f"  ID: {row['id']}")
    return "\n".join(parts)


# --- MCP Tools ---


@mcp.tool()
def capture(text: str, source: str = "mcp") -> str:
    """Capture a new thought into your brain. Generates an embedding and extracts metadata automatically.

    Args:
        text: The thought, note, decision, or insight to capture.
        source: Where this thought came from (default: "mcp"). Options: mcp, cli, slack, migration.
    """
    # Generate embedding and extract metadata in sequence
    # (parallel would require asyncio; these are fast enough sequentially)
    embedding = generate_embedding(text)
    metadata = extract_metadata(text)

    status = "untriaged" if metadata["thought_type"] == "action_item" else "active"

    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO thoughts (raw_text, embedding, thought_type, people, topics, action_items, source, status)
                VALUES (%s, %s::vector, %s, %s, %s, %s, %s, %s)
                RETURNING id, thought_type, people, topics, action_items, created_at
                """,
                (
                    text,
                    str(embedding),
                    metadata["thought_type"],
                    metadata["people"],
                    metadata["topics"],
                    metadata["action_items"],
                    source,
                    status,
                ),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    parts = [
        f"Captured as **{row['thought_type'].replace('_', ' ')}**.",
        f"Topics: {', '.join(row['topics']) if row['topics'] else 'none detected'}",
    ]
    if row["people"]:
        parts.append(f"People: {', '.join(row['people'])}")
    if row["action_items"]:
        parts.append("Action items:")
        for item in row["action_items"]:
            parts.append(f"  - {item}")
    parts.append(f"ID: {row['id']}")

    return "\n".join(parts)


@mcp.tool()
def semantic_search(query: str, limit: int = 10) -> str:
    """Search your brain by meaning. Finds thoughts semantically similar to your query, not just keyword matches.

    Args:
        query: What you're looking for, described naturally.
        limit: Maximum number of results to return (default: 10).
    """
    embedding = generate_embedding(query)

    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, raw_text, thought_type, people, topics, action_items,
                       created_at, 1 - (embedding <=> %s::vector) as similarity
                FROM thoughts
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (str(embedding), str(embedding), limit),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return "No thoughts found. Your brain is empty — start capturing!"

    results = []
    for row in rows:
        sim = f"{row['similarity']:.3f}" if row['similarity'] else "?"
        results.append(f"[{sim}] {format_thought(row)}")

    return f"Found {len(rows)} thoughts:\n\n" + "\n\n".join(results)


@mcp.tool()
def search_by_person(name: str, limit: int = 10) -> str:
    """Find all thoughts that mention a specific person.

    Args:
        name: The person's name to search for (case-insensitive partial match).
        limit: Maximum number of results (default: 10).
    """
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, raw_text, thought_type, people, topics, action_items, created_at
                FROM thoughts
                WHERE EXISTS (
                    SELECT 1 FROM unnest(people) p WHERE lower(p) LIKE lower(%s)
                )
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (f"%{name}%", limit),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return f"No thoughts found mentioning '{name}'."

    results = [format_thought(row) for row in rows]
    return f"Found {len(rows)} thoughts mentioning '{name}':\n\n" + "\n\n".join(results)


@mcp.tool()
def search_by_topic(topic: str, limit: int = 10) -> str:
    """Find all thoughts tagged with a specific topic.

    Args:
        topic: The topic to search for (case-insensitive partial match).
        limit: Maximum number of results (default: 10).
    """
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, raw_text, thought_type, people, topics, action_items, created_at
                FROM thoughts
                WHERE EXISTS (
                    SELECT 1 FROM unnest(topics) t WHERE lower(t) LIKE lower(%s)
                )
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (f"%{topic}%", limit),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return f"No thoughts found with topic '{topic}'."

    results = [format_thought(row) for row in rows]
    return f"Found {len(rows)} thoughts about '{topic}':\n\n" + "\n\n".join(results)


@mcp.tool()
def list_recent(days: int = 7, limit: int = 20) -> str:
    """List recently captured thoughts.

    Args:
        days: How many days back to look (default: 7).
        limit: Maximum number of results (default: 20).
    """
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, raw_text, thought_type, people, topics, action_items, created_at
                FROM thoughts
                WHERE created_at > now() - interval '%s days'
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (days, limit),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return f"No thoughts captured in the last {days} days."

    results = [format_thought(row) for row in rows]
    return f"{len(rows)} thoughts from the last {days} days:\n\n" + "\n\n".join(results)


@mcp.tool()
def stats(days: int = 30) -> str:
    """View your brain's statistics: capture frequency, topic distribution, and patterns.

    Args:
        days: How many days to analyze (default: 30).
    """
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Total thoughts
            cur.execute("SELECT count(*) as total FROM thoughts")
            total = cur.fetchone()["total"]

            # Thoughts in period
            cur.execute(
                "SELECT count(*) as recent FROM thoughts WHERE created_at > now() - interval '%s days'",
                (days,),
            )
            recent = cur.fetchone()["recent"]

            # By type
            cur.execute(
                """
                SELECT thought_type, count(*) as cnt
                FROM thoughts
                WHERE created_at > now() - interval '%s days'
                GROUP BY thought_type
                ORDER BY cnt DESC
                """,
                (days,),
            )
            type_rows = cur.fetchall()

            # Top topics
            cur.execute(
                """
                SELECT t as topic, count(*) as cnt
                FROM thoughts, unnest(topics) t
                WHERE created_at > now() - interval '%s days'
                GROUP BY t
                ORDER BY cnt DESC
                LIMIT 15
                """,
                (days,),
            )
            topic_rows = cur.fetchall()

            # Top people
            cur.execute(
                """
                SELECT p as person, count(*) as cnt
                FROM thoughts, unnest(people) p
                WHERE created_at > now() - interval '%s days'
                GROUP BY p
                ORDER BY cnt DESC
                LIMIT 10
                """,
                (days,),
            )
            people_rows = cur.fetchall()

            # Daily average
            cur.execute(
                """
                SELECT
                    count(*)::float / GREATEST(
                        EXTRACT(DAY FROM now() - min(created_at)), 1
                    ) as daily_avg
                FROM thoughts
                WHERE created_at > now() - interval '%s days'
                """,
                (days,),
            )
            daily_avg = cur.fetchone()["daily_avg"] or 0

    finally:
        conn.close()

    parts = [
        f"## Brain Stats (last {days} days)",
        f"",
        f"**Total thoughts:** {total}",
        f"**Last {days} days:** {recent}",
        f"**Daily average:** {daily_avg:.1f} thoughts/day",
        "",
    ]

    if type_rows:
        parts.append("**By type:**")
        for row in type_rows:
            parts.append(f"  {row['thought_type'].replace('_', ' ')}: {row['cnt']}")
        parts.append("")

    if topic_rows:
        parts.append("**Top topics:**")
        for row in topic_rows:
            parts.append(f"  {row['topic']}: {row['cnt']}")
        parts.append("")

    if people_rows:
        parts.append("**Most mentioned people:**")
        for row in people_rows:
            parts.append(f"  {row['person']}: {row['cnt']}")

    return "\n".join(parts)


@mcp.tool()
def delete_thought(thought_id: str) -> str:
    """Delete a thought from your brain by its ID.

    Args:
        thought_id: The UUID of the thought to delete.
    """
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM thoughts WHERE id = %s RETURNING id",
                (thought_id,),
            )
            deleted = cur.fetchone()
    finally:
        conn.close()

    if deleted:
        return f"Deleted thought {thought_id}."
    else:
        return f"No thought found with ID {thought_id}."


@mcp.tool()
def list_tasks(status: str = "untriaged", limit: int = 20) -> str:
    """List tasks (action_item thoughts) filtered by status. Use this to surface untriaged tasks at session start or review active/completed tasks.

    Args:
        status: Filter by status — one of: untriaged, active, completed, skipped (default: untriaged).
        limit: Maximum number of results (default: 20).
    """
    if status not in VALID_STATUSES:
        return f"Invalid status '{status}'. Must be one of: {', '.join(VALID_STATUSES)}"

    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, raw_text, thought_type, status, people, topics, action_items, created_at
                FROM thoughts
                WHERE thought_type = 'action_item' AND status = %s
                ORDER BY created_at ASC
                LIMIT %s
                """,
                (status, limit),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return f"No {status} tasks found."

    results = [format_thought(row) for row in rows]
    return f"{len(rows)} {status} task(s):\n\n" + "\n\n".join(results)


@mcp.tool()
def complete_task(thought_id: str) -> str:
    """Mark a task as completed. Non-destructive — the thought is kept but marked done.

    Args:
        thought_id: The UUID of the action_item to complete.
    """
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE thoughts SET status = 'completed'
                WHERE id = %s AND thought_type = 'action_item'
                RETURNING id, raw_text
                """,
                (thought_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return f"No action_item found with ID {thought_id}."
    return f"Completed task: {row['raw_text']}\nID: {row['id']}"


@mcp.tool()
def skip_task(thought_id: str) -> str:
    """Skip a task for now — moves it from untriaged to active so it won't appear in triage but stays on your radar.

    Args:
        thought_id: The UUID of the action_item to skip.
    """
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE thoughts SET status = 'active'
                WHERE id = %s AND thought_type = 'action_item'
                RETURNING id, raw_text
                """,
                (thought_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return f"No action_item found with ID {thought_id}."
    return f"Skipped (moved to active): {row['raw_text']}\nID: {row['id']}"


@mcp.tool()
def untriage_task(thought_id: str) -> str:
    """Move a task back to untriaged status — useful when a task needs re-evaluation or was triaged prematurely.

    Args:
        thought_id: The UUID of the action_item to untriage.
    """
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE thoughts SET status = 'untriaged'
                WHERE id = %s AND thought_type = 'action_item'
                RETURNING id, raw_text
                """,
                (thought_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return f"No action_item found with ID {thought_id}."
    return f"Moved back to untriaged: {row['raw_text']}\nID: {row['id']}"


# --- Entry Point ---

if __name__ == "__main__":
    mcp.run()
