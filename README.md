# 🧠 Open Brain

```
   ___                    ____            _
  / _ \ _ __   ___ _ __  | __ ) _ __ __ _(_)_ __
 | | | | '_ \ / _ \ '_ \ |  _ \| '__/ _` | | '_ \
 | |_| | |_) |  __/ | | || |_) | | | (_| | | | | |
  \___/| .__/ \___|_| |_||____/|_|  \__,_|_|_| |_|
       |_|
       because one brain is not enough in the age of the centaur
```

> *"Where did I put that thought?"*
> — You, before this existed

Your second brain, but make it ✨ semantic ✨. A personal knowledge base that understands *meaning*, not just keywords — accessible from Claude, ChatGPT, Cursor, your phone, your terminal, or literally anywhere that speaks MCP.

You think a thought. Your brain captures it, figures out what kind of thought it is, who you mentioned, what topics it touches, and files it away with a vector embedding. Later, you ask a question in natural language, and your brain actually *gets it*.

No folders. No tags. No Notion databases with 47 columns you set up once and never maintained. No "wait, where did I put that?"

Just vibes. Semantic vibes. 🫠

---

## 🤌 What's Inside

```
 you: "remind me about that conversation with Alex about the API redesign"
                                   |
                                  v
                    ╔══════════════════════════════╗
                    ║  🔮 semantic search          ║
                    ║  pgvector cosine similarity  ║
                    ╚══════════════════════════════╝
                                    |
                                    v
 brain: "Found 3 thoughts: Meeting with Alex on Feb 12..."
```

**7 tools. One brain. Zero organizational skills required.**

| Tool | What It Does | The Vibe |
|------|-------------|----------|
| `capture` | Save a thought with auto-generated embedding + metadata | 💭 "remember this" |
| `semantic_search` | Find thoughts by *meaning*, not keywords | 🔍 "what was that thing..." |
| `search_by_person` | Find thoughts mentioning someone | 👤 "what do I know about Sarah?" |
| `search_by_topic` | Find thoughts tagged with a topic | 🏷️ "what have I been thinking about system design?" |
| `list_recent` | Browse what's been on your mind | 📅 "what's been on my mind this week?" |
| `stats` | View your brain's patterns | 📊 "how's my brain doing?" |
| `delete_thought` | Remove a thought forever | 🗑️ "forget I said that" |

Every thought gets automatically classified (decision, insight, idea, reflection...), people are extracted, topics are tagged, and action items are surfaced. All of this happens invisibly — you just think, it just files.

You literally just talk to your AI and it handles the rest. This is the future and it took like a weekend to build. We are so back. 🚀

---

## 🏗️ The Stack

No exotic dependencies. No "run these 47 Docker containers" energy. No Kubernetes. No PhD required.

| What | Why |
|------|-----|
| **Neon Postgres** + **pgvector** | Your thoughts, vectorized and indexed. HNSW, cosine similarity, 1536 dimensions. The good stuff. |
| **OpenAI** | `text-embedding-3-small` for embeddings, `gpt-4o-mini` for metadata extraction. Cheap and fast. |
| **Next.js** on **Vercel** | MCP server deployed as a serverless API route. Push to deploy. Touch grass. |
| **Clerk** | OAuth 2.1 authentication. Browser-based login. No API keys floating around in configs. |
| **MCP** | Streamable HTTP transport. Works with Claude, ChatGPT, Cursor, Windsurf, VS Code, your toaster (probably). |

There's also a local Python MCP server in `src/mcp-server/` if you prefer stdio transport. Old school. Respect. 🤝

---

## 🧑‍🍳 Get Your Own Brain

It's easier than you think. You literally just need a database and two API keys.

### Prerequisites

- 🐘 A [Neon](https://neon.tech) Postgres database (free tier works, we're not animals)
- 🔑 An [OpenAI](https://platform.openai.com) API key
- ▲ A [Vercel](https://vercel.com) account
- 🔐 A [Clerk](https://clerk.com) account (free tier is fine — it's just you in there)
- 📦 Node.js 20+ and pnpm

### 1. Clone It

```bash
git clone https://github.com/shawnpetros/second-brain.git
cd second-brain
pnpm install
```

### 2. Give It a Database

Create a Neon database and run the schema:

```bash
psql $DATABASE_URL -f src/migrations/001_schema.sql
```

That's it. One table. Some indexes. A trigger. We're not building an ERP here.

### 3. Configure It

```bash
cp .env.example .env.local
```

Fill in your `DATABASE_URL` and `OPENAI_API_KEY`. Then set up Clerk 👇

### 4. Set Up Auth (Clerk OAuth 2.1)

Your brain is protected by OAuth 2.1 via Clerk. Nobody gets in without logging in through the browser first. Here's the setup:

1. **Create a Clerk app** at [clerk.com](https://clerk.com) (or reuse an existing one)
2. Grab your **API keys** from the Clerk Dashboard → API Keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_...`)
   - `CLERK_SECRET_KEY` (`sk_test_...`)
3. **Enable Dynamic Client Registration** — Clerk Dashboard → Configure → OAuth Applications → flip it on. This lets MCP clients (Claude Code, Cursor, etc.) register themselves automatically during the OAuth discovery flow. No manual app creation needed.
4. Add both keys to your `.env.local` and your Vercel environment variables

> 💡 **Dev keys vs Production keys:** Dev keys (`pk_test_` / `sk_test_`) use Clerk's `*.clerk.accounts.dev` domain and work out of the box — no DNS setup required. Production keys need a `clerk.<your-domain>` CNAME record pointing to `frontend-api.clerk.dev`. For a personal brain, dev keys are totally fine.

### 5. Ship It

```bash
vercel deploy
```

Or just push to GitHub and let Vercel auto-deploy. It's 2026, we don't manually deploy anymore. Go outside. 🌳

### 6. Plug In Your Brain

Add the MCP server to your AI client of choice. The URL is:

```
https://your-app.vercel.app/api/mcp
```

**Claude Code:**
```bash
claude mcp add open-brain --transport http https://your-app.vercel.app/api/mcp
```

When you first connect, Claude Code will:
1. Hit the MCP endpoint → get a 401
2. Discover the OAuth metadata automatically
3. Open a browser window for you to sign in via Clerk
4. Complete the OAuth flow and authenticate 🔐

No API keys to copy-paste. No bearer tokens. Just click and sign in.

**Claude Desktop / ChatGPT / Cursor:** Add as a remote MCP server in settings. Same OAuth flow — it'll prompt you to authenticate in the browser.

**That's it. You have a second brain now.** Go capture some thoughts. Tell it about your day. Ask it what you were thinking about last Tuesday. Live your best centaur life. 🐴🧑

---

## 🧪 Local Mode (Python)

For the "I don't trust the cloud" crowd (valid):

```bash
cd src/mcp-server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in your creds

claude mcp add open-brain -- $(pwd)/.venv/bin/python $(pwd)/server.py
```

Same brain, same tools, just running on your machine via stdio. Both servers hit the same database, so they're interchangeable.

---

## 🔬 How It Actually Works

```
 💭 "Remember: Alex suggested event-driven architecture for notifications"
        │
        ▼
   ┌─────────┐     ┌───────────────┐     ┌──────────────────────┐
   │ capture  │────▶│  OpenAI API   │────▶│   Neon Postgres      │
   │          │     │               │     │                      │
   │          │     │ 🧮 embedding  │     │ raw_text ✅           │
   │          │     │ 🏷️ metadata   │     │ vector(1536) ✅       │
   └──────────┘     └───────────────┘     │ type: decision ✅     │
                                          │ people: [Alex] ✅     │
                                          │ topics: [arch,        │
                                          │   notifications] ✅   │
                                          └──────────────────────┘

 ... three weeks later ...

 🔍 "What did we discuss about the notification system?"
        │
        ▼
   ┌──────────┐     ┌───────────────┐     ┌──────────────────────┐
   │ semantic  │────▶│  OpenAI API   │────▶│   Neon Postgres      │
   │ search    │     │               │     │                      │
   │           │     │ 🧮 embed the  │     │ 🔮 cosine similarity │
   │           │     │   query       │     │   across all vectors │
   └───────────┘     └───────────────┘     └──────────────────────┘
        │
        ▼
   "Alex suggested event-driven architecture for notifications..."
   similarity: 0.847  |  type: decision  |  people: Alex
```

The embedding space doesn't care about exact words. "notification system" matches "event-driven architecture for notifications" because they live in the same semantic neighborhood. That's the whole trick. That's the whole brain. 🧠

---

## 🤔 Why Build This

The centaur metaphor — human + AI, stronger together — only works if the AI half has access to *your* context, *your* history, *your* accumulated knowledge.

Built-in AI memory? It's a black box. You can't query it. You can't export it. You can't use it across different AI providers. You can't search it semantically. You don't own it.

This is *your* brain. Open source. On *your* infrastructure. Queryable by *any* AI you choose to work with. Portable. Searchable. Yours.

It's not about replacing your biological brain. It's about giving it a search engine that actually understands what you meant.

**Now stop reading READMEs and go capture some thoughts.** ✌️

---

## 📄 License

MIT — go build your own brain. Fork it. Remix it. Make it weird. We're all just vibing here.
