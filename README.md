# Open Brain

**Because one brain is not enough in the age of the centaur.**

Your second brain, but make it semantic. A personal knowledge base that understands *meaning*, not just keywords — accessible from Claude, ChatGPT, Cursor, your phone, your terminal, or anywhere that speaks MCP.

You think a thought. Your brain captures it, figures out what kind of thought it is, who you mentioned, what topics it touches, and files it away with a vector embedding. Later, you ask a question in natural language, and your brain actually *understands* what you meant.

No folders. No tags. No "wait, where did I put that?" Just vibes. Semantic vibes.

---

## What's Inside

```
you → "remind me about that conversation with Alex about the API redesign"
                              ↓
                    [semantic search] ← pgvector cosine similarity
                              ↓
brain → "Found 3 thoughts: Meeting with Alex on Feb 12..."
```

**7 tools, one brain:**

| Tool | What It Does |
|------|-------------|
| `capture` | Save a thought — auto-generates embedding + extracts metadata |
| `semantic_search` | Find thoughts by *meaning*, not keywords |
| `search_by_person` | "What do I know about Sarah?" |
| `search_by_topic` | "What have I been thinking about system design?" |
| `list_recent` | "What's been on my mind this week?" |
| `stats` | "How active has my brain been?" |
| `delete_thought` | "Forget I said that." |

Every thought gets automatically classified (decision, insight, idea, reflection...), people are extracted, topics are tagged, and action items are surfaced. All of this happens invisibly — you just think, it just files.

---

## The Stack

No exotic dependencies. No "run these 47 Docker containers" energy. Just:

- **Neon Postgres** + **pgvector** — your thoughts, vectorized and indexed (HNSW, cosine similarity, 1536 dimensions)
- **OpenAI** — `text-embedding-3-small` for embeddings, `gpt-4o-mini` for metadata extraction
- **Next.js** on **Vercel** — MCP server deployed as a serverless API route
- **MCP (Model Context Protocol)** — Streamable HTTP transport, works everywhere

The remote server speaks MCP's Streamable HTTP protocol, so any MCP-compatible client can connect: Claude (desktop, mobile, web), ChatGPT, Cursor, Windsurf, VS Code, or your own custom agent.

There's also a local Python MCP server in `src/mcp-server/` if you prefer stdio transport for Claude Code or Claude Desktop.

---

## Get Your Own Brain

### Prerequisites

- A [Neon](https://neon.tech) Postgres database (free tier works)
- An [OpenAI](https://platform.openai.com) API key
- A [Vercel](https://vercel.com) account (for deployment)
- Node.js 20+

### 1. Clone & Install

```bash
git clone https://github.com/shawnpetros/second-brain.git
cd second-brain
pnpm install
```

### 2. Set Up Your Database

Create a Neon database and run the schema:

```bash
psql $DATABASE_URL -f src/migrations/001_schema.sql
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Fill in your `DATABASE_URL`, `OPENAI_API_KEY`, and optionally a `BRAIN_API_KEY` (to protect your endpoint — generate one with `openssl rand -base64 32`).

### 4. Deploy

```bash
vercel deploy
```

Or just push to GitHub and let Vercel auto-deploy. It's 2026, we don't manually deploy anymore.

### 5. Connect Your Brain

Add the MCP server to your AI client. The URL is:

```
https://your-app.vercel.app/api/mcp
```

**Claude Code:**
```bash
claude mcp add open-brain --transport http https://your-app.vercel.app/api/mcp
```

**Claude Desktop / ChatGPT / Cursor:** Add as a remote MCP server in settings with the URL above. If you set a `BRAIN_API_KEY`, configure the bearer token in your client's MCP server auth settings.

---

## Local Mode (Python)

If you want a local-only brain (no deployment, stdio transport):

```bash
cd src/mcp-server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in your creds

claude mcp add open-brain -- $(pwd)/.venv/bin/python $(pwd)/server.py
```

---

## How It Works

```
[You] "Remember: Alex suggested we switch to event-driven architecture for the notification system"
        │
        ▼
   ┌─────────┐     ┌──────────────┐     ┌──────────────────┐
   │ Capture  │────▶│  OpenAI API  │────▶│  Neon Postgres   │
   │  Tool    │     │              │     │                  │
   │         │     │ • embedding  │     │ • raw_text       │
   │         │     │ • metadata   │     │ • vector(1536)   │
   └─────────┘     └──────────────┘     │ • type: decision │
                                        │ • people: [Alex] │
                                        │ • topics: [arch, │
                                        │   notifications] │
                                        └──────────────────┘
```

Later:

```
[You] "What did we discuss about the notification system?"
        │
        ▼
   ┌──────────┐     ┌──────────────┐     ┌──────────────────┐
   │ Semantic  │────▶│  OpenAI API  │────▶│  Neon Postgres   │
   │  Search   │     │  (embed      │     │  (cosine         │
   │          │     │   query)     │     │   similarity)    │
   └──────────┘     └──────────────┘     └──────────────────┘
        │
        ▼
   "Alex suggested event-driven architecture for notifications..."
```

---

## Why Build This

The centaur metaphor — human + AI, stronger together — only works if the AI half has access to *your* context, *your* history, *your* accumulated knowledge. Built-in AI memory is a black box. This is your brain, open, on your infrastructure, queryable by any AI you choose to work with.

It's not about replacing your biological brain. It's about giving it a search engine.

---

## License

MIT — go build your own brain.
