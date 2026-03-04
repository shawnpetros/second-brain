# Human Action Items

Items that require manual human action to complete the Open Brain setup.

---

## Decision Log

### Infrastructure: Neon Postgres (via Vercel) — NOT Supabase

Your mealsgpt.com project already uses Neon + Drizzle + Vercel with pgvector (1536-dim embeddings, HNSW indexes). Using the same stack for the brain means:
- No new account to create (use your existing Vercel/Neon setup)
- Same ORM, same patterns, same deployment pipeline
- One less vendor relationship to manage

### Auth: Bearer Token (not full OAuth 2.1)

For a single-user personal brain, bearer token auth is the pragmatic choice. Set `BRAIN_API_KEY` in Vercel env vars and configure the same token in your MCP clients. OAuth 2.1 can be added later if you want multi-user support or need a more formal auth flow.

---

## Phase 1: Database Setup

- [ ] **Create a new Neon database for the brain**
  - Option A: Create a new database in your existing Neon project (Vercel dashboard → Storage → your Postgres → create a new database named `brain`)
  - Option B: Create a separate Neon project for isolation (Vercel dashboard → Storage → Create Database)
  - Either works. Option A is simpler.

- [ ] **Run schema migration**
  - Get the connection string from Vercel dashboard → Storage → Postgres → `.env.local` tab
  - Run: `psql $DATABASE_URL -f src/migrations/001_schema.sql`
  - Verify: `psql $DATABASE_URL -c "SELECT count(*) FROM thoughts;"` (should return 0)

- [ ] **Ensure you have an OpenAI API key**
  - You likely already have one from mealsgpt.com
  - Needs access to: `text-embedding-3-small` and `gpt-4o-mini`

## Phase 2: Deploy Remote Brain (Vercel)

- [ ] **Link Vercel project**
  - Run: `vercel link` or connect the GitHub repo in Vercel dashboard
  - The Next.js app is ready to deploy as-is

- [ ] **Set environment variables in Vercel**
  - `DATABASE_URL` — Neon connection string
  - `OPENAI_API_KEY` — your OpenAI key
  - `BRAIN_API_KEY` — generate with `openssl rand -base64 32` (protects your MCP endpoint)

- [ ] **Deploy**
  - Push to GitHub or run `vercel deploy --prod`
  - Verify: visit `https://your-app.vercel.app/` — should show the landing page

- [ ] **Connect MCP clients**
  - Claude Code: `claude mcp add open-brain --transport http https://your-app.vercel.app/api/mcp`
  - Claude Desktop / ChatGPT / Cursor: add as remote MCP server with the URL above + bearer token auth

## Phase 3: Local Python Server (optional, for Claude Code stdio)

- [ ] **Create `.env` file** in `src/mcp-server/`
  - Copy `.env.example` → `.env`
  - Fill in `DATABASE_URL` and `OPENAI_API_KEY`

- [ ] **Install Python dependencies**
  - Run: `cd src/mcp-server && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`

- [ ] **Register local MCP server in Claude Code**
  - See `src/mcp-server/README.md` for instructions

## Phase 4: Slack Capture (later — after core is working)

- [ ] **Create Slack app** at [api.slack.com/apps](https://api.slack.com/apps)
- [ ] **Deploy Vercel API route** for webhook endpoint
- [ ] **Create `#brain` channel** in your Slack workspace

---

## Nice-to-Haves (not blocking)

- [ ] **Export ChatGPT memories** — Settings → Personalization → Memory → ask "list all your memories about me"
- [ ] **Export Claude memories** — Settings → Memory → copy all listed memories
- [ ] Run the migration script to import these into the brain
