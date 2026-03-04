# Second Brain (Open Brain) — Project Plan

## Vision

A database-backed, AI-accessible personal knowledge system that you own outright — no SaaS middlemen. One brain that every AI tool (Claude, ChatGPT, Cursor, agents) can plug into via MCP. Capture a thought from anywhere; it's embedded, classified, and searchable by meaning within seconds.

**Target cost:** ~$0.10–$0.30/month in API calls at ~20 thoughts/day.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CAPTURE LAYER                        │
│  Slack · Claude · ChatGPT · CLI · Messaging · Any MCP  │
└──────────────────────┬──────────────────────────────────┘
                       │ thought (raw text)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              PROCESSING PIPELINE                        │
│  MCP Server (local) / Vercel API Route (Phase 3)        │
│  ┌──────────────┐  ┌─────────────────────────────┐     │
│  │ Vector Embed  │  │ Metadata Extraction (LLM)   │     │
│  │ (OpenAI       │  │ - People mentioned           │     │
│  │  text-        │  │ - Topics                    │     │
│  │  embedding-   │  │ - Type (decision, insight,   │     │
│  │  3-small,     │  │   meeting, person, idea)     │     │
│  │  1536 dims)   │  │ - Action Items               │     │
│  └──────┬───────┘  │ - Source (slack, mcp, cli)    │     │
│         │          └──────────────┬────────────────┘     │
│         └────────────┬───────────┘                      │
│                      ▼                                  │
│         ┌────────────────────────┐                      │
│         │   PostgreSQL + pgvector │                      │
│         │   (Neon via Vercel)    │                      │
│         └────────────────────────┘                      │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 RETRIEVAL LAYER                         │
│  MCP Server (local, stdio transport)                   │
│  Connects to Neon Postgres via connection string        │
│  ┌────────────────┐ ┌───────────┐ ┌──────────┐        │
│  │ Semantic Search │ │ List Recent│ │  Stats   │        │
│  └────────────────┘ └───────────┘ └──────────┘        │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────┐        │
│  │ Capture  │ │  Delete   │ │ Search by Person │        │
│  └─────────┘ └──────────┘ └──────────────────┘        │
│                                                         │
│  Clients: Claude Code · Claude Desktop · Cursor ·      │
│           VS Code · Any MCP-compatible tool             │
└─────────────────────────────────────────────────────────┘
```

### Data Flow: Two Capture Paths

**Path A — Slack (lowest friction, async):**
```
User types in Slack channel
  → Slack webhook fires
  → Supabase Edge Function receives text
  → Edge function calls OpenAI embeddings API + LLM for metadata (in parallel)
  → Stores thought + embedding + metadata in Postgres
  → Replies in Slack thread with confirmation + extracted metadata
```

**Path B — MCP `capture` tool (from any AI client):**
```
User tells Claude/Cursor "remember this: ..."
  → MCP server's `capture` tool receives text
  → MCP server calls Supabase Edge Function via HTTP POST
  → Same processing pipeline as Path A
  → Returns confirmation to the AI client
```

Both paths converge on the same edge function. The MCP server does NOT write directly to the database for capture — it delegates to the edge function to ensure consistent embedding + metadata extraction. The MCP server DOES read directly from Postgres for retrieval (semantic search, list recent, stats) using a direct connection string.

---

## Core Components

### 1. PostgreSQL Database (Supabase)

**Why Supabase specifically (not self-hosted):**
- Free tier includes 500MB storage, which holds ~250K thoughts at ~2KB avg per row (embedding + metadata + text). At 20 thoughts/day, that's 34+ years of capacity.
- Managed Postgres with pgvector pre-installed — no ops burden.
- Edge Functions included — no separate compute to manage.
- Connection pooling via Supavisor included.
- If you outgrow free tier or Supabase changes pricing, export is a `pg_dump` — you own the schema and data.

**Schema:**

```sql
-- Enable pgvector
create extension if not exists vector;

-- Primary thoughts table
create table thoughts (
  id            uuid primary key default gen_random_uuid(),
  raw_text      text not null,
  embedding     vector(1536) not null,
  thought_type  text not null check (thought_type in (
                  'decision', 'insight', 'meeting', 'person_note',
                  'idea', 'action_item', 'reflection', 'reference'
                )),
  people        text[] default '{}',
  topics        text[] default '{}',
  action_items  text[] default '{}',
  source        text not null default 'manual',  -- 'slack', 'mcp', 'cli', 'migration'
  source_ref    text,                             -- e.g., slack message ID, URL
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- HNSW index for fast semantic search (cosine distance)
create index thoughts_embedding_idx
  on thoughts using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Indexes for filtered queries
create index thoughts_type_idx on thoughts (thought_type);
create index thoughts_created_idx on thoughts (created_at desc);
create index thoughts_people_idx on thoughts using gin (people);
create index thoughts_topics_idx on thoughts using gin (topics);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger thoughts_updated_at
  before update on thoughts
  for each row execute function update_updated_at();
```

**Why structured columns instead of a single JSONB `metadata` blob:**
- `people` and `topics` as `text[]` with GIN indexes enables fast filtered queries ("show me all thoughts mentioning Sarah") without JSON path queries.
- `thought_type` as a constrained text column prevents classification drift and enables clean stats.
- Semantic search still handles the fuzzy/meaning-based retrieval. Structured columns handle the precise/filtered retrieval. Both are needed.

### 2. Processing Pipeline (Supabase Edge Function)

**Language:** TypeScript (Deno runtime — Supabase Edge Functions only support Deno).

**API Contract:**

```
POST /functions/v1/capture-thought
Content-Type: application/json
Authorization: Bearer <SUPABASE_ANON_KEY>

Request:
{
  "text": "Talked with Sarah about her consulting idea. She's unhappy since the reorg.",
  "source": "slack",          // optional, defaults to "manual"
  "source_ref": "C04ABC123/p1234567890" // optional, e.g., slack channel/message ID
}

Response (200):
{
  "id": "a1b2c3d4-...",
  "thought_type": "person_note",
  "people": ["Sarah"],
  "topics": ["career", "consulting", "organizational change"],
  "action_items": [],
  "created_at": "2026-03-04T..."
}
```

**Processing steps (parallel):**
1. Call OpenAI `text-embedding-3-small` → 1536-dim vector (cost: ~$0.00002 per thought)
2. Call OpenAI `gpt-4o-mini` with structured output to extract:
   - `thought_type` (one of the enum values)
   - `people` (names mentioned)
   - `topics` (2-5 keywords)
   - `action_items` (if any)
   - Cost: ~$0.0003 per thought

**Why `text-embedding-3-small` over alternatives:**
- 1536 dimensions — good balance of quality and storage size
- $0.02/1M tokens — cheapest high-quality embedding model available
- Excellent multilingual support
- If OpenAI pricing changes or you want to go fully local, swap to `nomic-embed-text` (open source, 768 dims — update the vector column dimension and rebuild the index)

**Why `gpt-4o-mini` for metadata extraction:**
- Structured JSON output mode eliminates parsing failures
- Fast enough for real-time capture confirmation (~500ms)
- Cheap enough for 20+ thoughts/day to be negligible
- Classification accuracy is "good enough" because semantic search handles fuzzy retrieval regardless of metadata accuracy

### 3. MCP Server

**Implementation:** Python, using the `mcp` library (Anthropic's official SDK).

**Where it runs:** Locally on your machine. Launched by Claude Code / Claude Desktop as a subprocess via stdio transport. Does NOT need to be deployed anywhere.

**Connection to Supabase:** Direct Postgres connection string (from Supabase dashboard → Settings → Database → Connection string). Uses `psycopg2` or `asyncpg` for queries. The connection string goes in an environment variable, not hardcoded.

**Tools exposed:**

| Tool | Description | Query Type |
|------|------------|------------|
| `semantic_search(query, limit=10)` | Find thoughts by meaning. Generates embedding for `query`, runs cosine similarity search. | Vector similarity |
| `search_by_person(name, limit=10)` | Find all thoughts mentioning a specific person. | Array contains (`@>`) |
| `search_by_topic(topic, limit=10)` | Find thoughts tagged with a topic. | Array contains (`@>`) |
| `list_recent(days=7, limit=20)` | Browse recent captures. | `created_at > now() - interval` |
| `stats(days=30)` | Topic distribution, capture frequency, people mentioned most. | Aggregation queries |
| `capture(text, source='mcp')` | Write a new thought. Calls the Supabase edge function via HTTP. | HTTP POST to edge function |
| `delete(id)` | Delete a thought by ID. | `DELETE WHERE id = $1` |

**Why the MCP server calls the edge function for capture instead of writing directly:**
The edge function handles embedding generation and metadata extraction. If the MCP server wrote directly to Postgres, it would need to duplicate that logic (embedding API calls, LLM classification). Routing through the edge function keeps one code path for all capture sources.

**Configuration (Claude Code):**
```json
// In ~/.claude.json under projects.<project>.mcpServers:
{
  "open-brain": {
    "type": "stdio",
    "command": "python3",
    "args": ["/path/to/open-brain-mcp/server.py"],
    "env": {
      "SUPABASE_DB_URL": "postgresql://postgres:...@db.xxx.supabase.co:5432/postgres",
      "SUPABASE_URL": "https://xxx.supabase.co",
      "SUPABASE_ANON_KEY": "eyJ...",
      "OPENAI_API_KEY": "sk-..."
    }
  }
}
```

### 4. Capture Integrations

**Primary: Slack (Slack free tier)**

Setup:
1. Create a Slack app at api.slack.com → "From scratch"
2. Enable Event Subscriptions → subscribe to `message.channels`
3. Set the Request URL to your Supabase edge function endpoint: `https://<project>.supabase.co/functions/v1/capture-thought`
4. Create a dedicated `#brain` channel — only messages in this channel trigger the capture pipeline
5. The edge function receives the Slack event, processes the text, and replies in-thread with confirmation

**Why Slack specifically:**
- Already open on most people's machines
- Mobile app means you can capture thoughts from anywhere
- Free tier supports webhooks and bot replies
- The friction of "type a thought in a channel" is lower than any custom app
- If you don't use Slack, substitute any messaging app with webhook support (Discord, Telegram, etc.)

**Secondary: MCP `capture` tool**
- Available from any MCP client (Claude Code, Claude Desktop, Cursor)
- Say "remember that I decided to use Redis for caching" → MCP server captures it
- Same processing pipeline, just a different entry point

**Future (not in initial build):**
- CLI tool (`brain capture "thought here"`) for terminal workflows
- iOS/macOS Shortcut for quick mobile capture
- Browser extension for capturing context from web pages

### 5. ChatGPT Access

ChatGPT does NOT natively support MCP servers. Options for cross-tool access:

1. **ChatGPT Desktop App (macOS):** Supports MCP as of early 2026. Configure the same MCP server in ChatGPT's settings.
2. **Custom GPT with Actions:** Create a custom GPT that calls your Supabase edge function via HTTP. Requires exposing a read endpoint (add a `search-thoughts` edge function that accepts a query, generates an embedding, and returns matching thoughts).
3. **Manual bridge:** Ask ChatGPT to formulate a query → paste into Claude/Cursor which has MCP access → paste results back. Low-tech but works immediately.

Option 2 is recommended if you use ChatGPT regularly — it takes ~30 minutes to set up and gives ChatGPT full read access to your brain.

---

## Implementation Phases

### Phase 1: Database + Processing Pipeline (~2-3 hours)

| Step | Task | Est. Time | Notes |
|------|------|-----------|-------|
| 1.1 | Create Supabase account and project | 5 min | supabase.com → free tier |
| 1.2 | Run schema SQL (thoughts table, indexes, trigger) | 5 min | Copy-paste from schema above into Supabase SQL Editor |
| 1.3 | Get connection credentials | 5 min | Settings → Database → Connection string; Settings → API → anon key + URL |
| 1.4 | Create edge function `capture-thought` | 45 min | `supabase functions new capture-thought`, implement TypeScript handler |
| 1.5 | Get OpenAI API key | 5 min | platform.openai.com → API keys (if you don't already have one) |
| 1.6 | Set edge function secrets | 5 min | `supabase secrets set OPENAI_API_KEY=sk-...` |
| 1.7 | Deploy edge function | 5 min | `supabase functions deploy capture-thought` |
| 1.8 | Test end-to-end | 15 min | `curl` the edge function with a sample thought, verify row appears in Supabase table browser with correct embedding + metadata |

**Definition of done:** You can POST a thought via curl, and it appears in the `thoughts` table with a valid embedding vector and correctly extracted metadata.

### Phase 2: MCP Server (~2-3 hours)

| Step | Task | Est. Time | Notes |
|------|------|-----------|-------|
| 2.1 | Create Python project for MCP server | 10 min | `mkdir open-brain-mcp && cd open-brain-mcp && python3 -m venv .venv` |
| 2.2 | Install dependencies | 5 min | `pip install mcp psycopg2-binary openai` |
| 2.3 | Implement `semantic_search` tool | 30 min | Generate query embedding via OpenAI, run cosine similarity query |
| 2.4 | Implement `list_recent`, `stats`, `search_by_person`, `search_by_topic` tools | 30 min | Standard SQL queries |
| 2.5 | Implement `capture` tool | 15 min | HTTP POST to Supabase edge function |
| 2.6 | Implement `delete` tool | 10 min | DELETE by UUID |
| 2.7 | Configure in Claude Code | 5 min | Add to `~/.claude.json` or project `.claude/settings.local.json` |
| 2.8 | Test retrieval | 20 min | From Claude Code, run `semantic_search` for the thought you captured in Phase 1. Verify relevance. Try `list_recent`. Try `capture` via MCP. |

**Definition of done:** From Claude Code, you can search your brain by meaning, list recent thoughts, capture new thoughts, and see stats. The same MCP server can be added to Claude Desktop and Cursor.

### Phase 3: Slack Capture Integration (~1-2 hours)

| Step | Task | Est. Time | Notes |
|------|------|-----------|-------|
| 3.1 | Create Slack app | 10 min | api.slack.com → Create New App → From scratch |
| 3.2 | Configure Event Subscriptions | 10 min | Subscribe to `message.channels`, set Request URL to edge function |
| 3.3 | Add bot to workspace, create `#brain` channel | 5 min | |
| 3.4 | Update edge function to handle Slack event format | 30 min | Slack sends a JSON envelope — extract `event.text`, ignore bot messages, reply in thread |
| 3.5 | Test capture from Slack | 15 min | Type a thought in `#brain`, verify it appears in DB, verify bot replies with confirmation |
| 3.6 | Create quick-capture templates | 15 min | Pin templates in `#brain` channel for decision, person note, insight, meeting debrief |

**Quick-capture templates (pin in `#brain`):**
```
DECISION: [what you decided] because [why]. Alternatives were [what you didn't choose].
PERSON: Talked with [name]. [what you discussed]. [any follow-ups].
INSIGHT: [the insight]. This connects to [what it relates to].
MEETING: Met with [who] about [topic]. Decided [decisions]. Next steps: [actions].
IDEA: [the idea]. Could be useful for [context].
```

**Definition of done:** Type a thought in `#brain` on Slack, get a threaded confirmation within 10 seconds showing extracted type, people, topics, and action items.

### Phase 4: Memory Migration (~1-2 hours)

**The problem:** Your existing AI tools have context about you that's trapped. Here's how to extract it per platform.

| Source | How to Extract | Notes |
|--------|---------------|-------|
| **Claude** | Open Claude.ai → Settings → Memory → each memory is listed as text. Copy all. Alternatively, ask Claude: "List everything you remember about me in a single message." | Claude's memory is viewable but has no bulk export API. Manual copy is the fastest path. |
| **ChatGPT** | Settings → Personalization → Memory → "Manage" → each memory is listed. Or ask: "List all your memories about me." Or use the data export (Settings → Data controls → Export data) which includes a `model_comparisons.json` with memories. | ChatGPT data export takes up to 24 hours. The in-app memory list is faster for small sets. |
| **Cursor** | Cursor stores context in `.cursorrules` and project-level memory. Check `~/.cursor/` for any persistent state. | Cursor's memory is project-scoped, not personal. Less to migrate. |
| **Notes apps** | For Notion: export as Markdown. For Apple Notes: select all → share → copy text. For Obsidian: vault is already Markdown files. | Don't migrate everything — migrate the thoughts, decisions, and insights that you'd want an AI to know about you. |

**Migration pipeline:**
1. Collect all extracted text into a single file (one thought per line, or separated by blank lines)
2. Write a migration script that reads each thought and POSTs it to your edge function with `"source": "migration"`
3. Run it. At ~2 seconds per thought, 200 thoughts takes ~7 minutes.
4. Verify via `semantic_search` in Claude Code — search for a topic you know you migrated

**Definition of done:** Search your brain for a topic from your old ChatGPT/Claude memories and get relevant results.

### Phase 5: Habit Building & Optimization (~ongoing)

| Activity | Frequency | Purpose |
|----------|-----------|---------|
| **Daily capture** | 5-20 thoughts/day | Build the knowledge base. Capture decisions, insights, people notes, meeting takeaways. |
| **Weekly review prompt** | Friday, 5 min | Ask your AI: "Search my brain for everything captured this week. Cluster by topic, flag unresolved action items, identify patterns across days, surface connections I might have missed." |
| **Open Brain Spark** | When stuck on what to capture | Ask your AI: "Interview me about my current projects, recent decisions, and key people. Suggest 10 specific things I should capture in my brain this week." |
| **Monthly retrieval check** | 5 min | Search for something you know you captured. Did it come back? Was the metadata accurate? Tune the extraction prompt if needed. |

**When to capture (build this instinct):**
- You made a decision and want to remember why
- You talked to someone and learned something about them
- You had an insight or idea worth returning to
- You finished a meeting and want to preserve the key points
- You tried something and it worked (or didn't)
- You changed your mind about something

**When NOT to capture:**
- Raw data that belongs in a proper database or document
- Temporary/ephemeral context ("remind me to buy milk")
- Anything you wouldn't want an AI to surface in 6 months

**Definition of done:** You're capturing 5+ thoughts/day without friction, and your weekly review surfaces at least one connection or pattern you wouldn't have noticed otherwise.

### Phase 6: Agent Integration (Future — after agents stabilize)

This phase is intentionally deferred. The agent ecosystem (OpenClaw, Claude agents, etc.) is moving too fast to build stable integrations today. When you're ready:

- The MCP server already exposes read + write tools — any MCP-compatible agent can use it immediately
- For non-MCP agents, expose the Supabase edge function as an HTTP API (it already is one)
- Consider adding a `context_for_task(task_description)` tool that returns relevant memories pre-filtered for a specific task — this is the "intent engineering" bridge between your brain and an agent's workflow
- Consider adding a `log_agent_action(action, result, context)` tool so agents can write back what they did and why — this creates an audit trail and feeds your weekly review

---

## Backup & Export Strategy

Your data lives in Supabase's managed Postgres. To maintain the "you own it" principle:

| Method | Frequency | How |
|--------|-----------|-----|
| **Supabase daily backup** | Automatic | Supabase free tier includes daily backups with 7-day retention |
| **Manual pg_dump** | Monthly | `pg_dump $SUPABASE_DB_URL --table=thoughts > thoughts_backup_$(date +%Y%m%d).sql` |
| **JSON export** | As needed | MCP server `stats` tool can be extended to dump all thoughts as JSON for portability |

If Supabase changes pricing, disappears, or you want to self-host: `pg_dump` your data, spin up Postgres + pgvector anywhere (Docker, Railway, Fly.io, your own server), `pg_restore`, update the connection string in your MCP server config. Zero code changes.

---

## Key Design Principles

1. **You own it.** Postgres, not proprietary formats. `pg_dump` at any time. No vendor lock-in.
2. **Agent-readable first.** Built for machine consumption: vector embeddings, structured metadata, SQL queries. Human-readable views are a layer on top, not the foundation.
3. **Model-agnostic.** MCP protocol means any AI that speaks MCP can access your brain. Swap Claude for ChatGPT for Cursor — same brain, same context.
4. **Compound over time.** Every thought captured makes semantic search smarter (denser embedding space = better similarity matches). The system gets more valuable with use.
5. **Boring infrastructure.** Postgres has been battle-tested for 28 years. pgvector is a simple extension. Supabase is open-source Postgres with managed hosting. Nothing here is experimental.
6. **Low cost, high ceiling.** Free tiers cover everything except API calls (~$0.10–0.30/month). The architecture scales to millions of thoughts without redesign.
7. **One processing pipeline.** All capture sources (Slack, MCP, CLI, future integrations) route through the same edge function. One place to update classification logic, one place to change embedding models.

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Semantic search relevance | Top-3 results contain the relevant thought >80% of the time | Manual spot-checks during weekly review |
| Capture-to-searchable latency | < 10 seconds | Time from Slack message to threaded confirmation |
| Cross-tool context continuity | Same query in Claude Code and Claude Desktop returns same results | Run identical searches in both clients |
| Monthly capture volume | 150+ thoughts/month (5/day avg) | `SELECT count(*) FROM thoughts WHERE created_at > now() - interval '30 days'` |
| Monthly running cost | < $1.00 | Track OpenAI API usage dashboard |
| Memory migration completeness | Core context from Claude + ChatGPT memories is searchable | Search for 10 known topics from old memories, verify recall |
| Weekly review value | Surfaces at least 1 non-obvious connection per week | Subjective assessment during Friday review |

---

## Tech Stack

| Component | Technology | Cost | Free Tier Limits |
|-----------|-----------|------|-----------------|
| Database | PostgreSQL + pgvector (Supabase) | $0 | 500MB storage (~250K thoughts), 50K MAU |
| Processing | Supabase Edge Functions (Deno) | $0 | 500K invocations/month, 2M edge function invocations |
| Embeddings | OpenAI `text-embedding-3-small` | ~$0.10/mo | Pay-per-use, no free tier |
| Metadata extraction | OpenAI `gpt-4o-mini` | ~$0.10/mo | Pay-per-use, no free tier |
| MCP Server | Python (`mcp` + `psycopg2` + `openai`) | $0 | Runs locally |
| Capture | Slack free tier + webhook | $0 | 90-day message history (irrelevant — data is in Postgres) |
| Backup | `pg_dump` + local storage | $0 | N/A |

**Total: ~$0.20/month** at 20 thoughts/day.

**When you'd outgrow free tier:** At ~250K thoughts (34 years at 20/day) or if you start storing large documents rather than short thoughts. At that point, Supabase Pro is $25/month — still cheap for the value.

---

## File Structure (this project)

```
second-brain/
├── PROJECT_PLAN.md          ← this file
├── ANALYSIS.md              ← video analysis synthesis
├── TRAINING_RECOMMENDATIONS.md  ← upskilling plan
├── input/                   ← source audio files (mp3)
├── output/                  ← transcriptions (srt, txt, json)
└── src/                     ← implementation (created during build)
    ├── edge-functions/
    │   └── capture-thought/ ← Supabase edge function (TypeScript/Deno)
    ├── mcp-server/          ← Open Brain MCP server (Python)
    │   ├── server.py
    │   ├── requirements.txt
    │   └── .env.example
    ├── migrations/
    │   └── 001_schema.sql   ← Database schema
    └── scripts/
        └── migrate.py       ← Memory migration script
```

---

## References

- Source video: "You Don't Need SaaS. The $0.10 System That Replaced My AI Workflow" (Nate)
- [MCP Protocol](https://modelcontextprotocol.io) — Anthropic's open-source standard for AI tool communication
- [pgvector](https://github.com/pgvector/pgvector) — PostgreSQL extension for vector similarity search
- [Supabase](https://supabase.com) — Open-source Firebase alternative with managed Postgres
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings) — text-embedding-3-small documentation
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) — Official Python library for building MCP servers
