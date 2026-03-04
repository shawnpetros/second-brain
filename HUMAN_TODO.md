# Human Action Items

Items that require manual human action to complete the Open Brain setup.

---

## Decision Log

### Infrastructure Choice: Neon Postgres (via Vercel) — NOT Supabase

Your mealsgpt.com project already uses Neon + Drizzle + Vercel with pgvector (1536-dim embeddings, HNSW indexes). Using the same stack for the brain means:
- No new account to create (use your existing Vercel/Neon setup)
- Same ORM, same patterns, same deployment pipeline
- One less vendor relationship to manage

For the initial build, the MCP server handles everything locally — no deployed API needed. It connects directly to Neon Postgres, generates embeddings via OpenAI, extracts metadata via GPT-4o-mini, and writes to the DB. A Vercel API route only becomes necessary when you add Slack capture (Phase 3).

---

## Phase 1: Database Setup

- [ ] **Create a new Neon database for the brain**
  - Option A: Create a new database in your existing Neon project (Vercel dashboard → Storage → your Postgres → create a new database named `brain`)
  - Option B: Create a separate Neon project for isolation (Vercel dashboard → Storage → Create Database)
  - Either works. Option A is simpler. Option B is cleaner if you want independent billing/limits.

- [ ] **Run schema migration**
  - Get the connection string from Vercel dashboard → Storage → Postgres → `.env.local` tab
  - Run: `psql $DATABASE_URL -f src/migrations/001_schema.sql`
  - Verify: `psql $DATABASE_URL -c "SELECT count(*) FROM thoughts;"` (should return 0)

- [ ] **Ensure you have an OpenAI API key**
  - You likely already have one from mealsgpt.com
  - Check your existing `.env` files or [platform.openai.com](https://platform.openai.com) → API keys
  - Needs access to: `text-embedding-3-small` and `gpt-4o-mini`

## Phase 2: MCP Server Activation

- [ ] **Create `.env` file** in `src/mcp-server/`
  - Copy `.env.example` → `.env`
  - Fill in `DATABASE_URL` (Neon connection string) and `OPENAI_API_KEY`

- [ ] **Install Python dependencies**
  - Run: `cd src/mcp-server && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`

- [ ] **Register MCP server in Claude Code**
  - The setup script will attempt this automatically
  - If it fails, manually add to your Claude config (instructions in `src/mcp-server/README.md`)

- [ ] **Test it**
  - Restart Claude Code
  - Ask Claude: "capture this thought: Testing my open brain system for the first time"
  - Then: "search my brain for testing"
  - If both work, you're live.

## Phase 3: Slack Capture (later — after core is working)

- [ ] **Create Slack app** at [api.slack.com/apps](https://api.slack.com/apps)
- [ ] **Deploy Vercel API route** for webhook endpoint
- [ ] **Create `#brain` channel** in your Slack workspace

---

## Nice-to-Haves (not blocking)

- [ ] **Export ChatGPT memories** — Settings → Personalization → Memory → ask "list all your memories about me"
- [ ] **Export Claude memories** — Settings → Memory → copy all listed memories
- [ ] Run the migration script to import these into the brain
