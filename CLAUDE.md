# Open Brain

When the user asks to "remember", "capture", "save a thought", "note this", or anything that implies storing a piece of knowledge for later retrieval — use the `open-brain` MCP server's `capture` tool. Do NOT use the built-in memory system (MEMORY.md files) for this purpose.

The built-in memory system should only be used for project-specific coding context (file patterns, architecture decisions, dev preferences). Everything else goes to the brain via MCP.

## MCP Tools Available (open-brain)
- `capture` — save a thought (action_items are auto-tagged as `untriaged`)
- `semantic_search` — find thoughts by meaning
- `search_by_person` — find thoughts about a person
- `search_by_topic` — find thoughts about a topic
- `list_recent` — recent thoughts
- `stats` — brain statistics
- `delete_thought` — remove a thought permanently
- `list_tasks` — list action_item thoughts filtered by status (untriaged, active, completed, skipped)
- `complete_task` — mark a task as completed (non-destructive, keeps the record)
- `skip_task` — move a task from untriaged to active (defers it for later)
- `untriage_task` — move a task back to untriaged status
- `add_service` — add a service/tool to business inventory (name, category, billing_model, projects, cost, notes)
- `list_services` — list services with optional filters (category, project, status); shows cost totals
- `update_service` — update any field on a service by ID
- `remove_service` — delete a service by ID

## Task Management

Thoughts classified as `action_item` have a `status` lifecycle:
- **untriaged** — newly captured, not yet reviewed
- **active** — reviewed and acknowledged, but not yet done
- **completed** — done
- **skipped** — explicitly deferred

A SessionStart hook automatically checks for untriaged tasks and prompts the user to triage them (work on it, skip, or mark complete).

## Database Migrations

Migrations are sequential `.sql` files in `src/migrations/`, numbered `001_`, `002_`, etc. A `schema_migrations` table in Postgres tracks which files have been applied.

**Workflow for schema changes:**
1. Update the Drizzle schema in `lib/db/schema/`
2. Create a new numbered `.sql` file in `src/migrations/` with the DDL
3. If existing data needs updating, add a follow-up backfill migration (e.g. `003_backfill_status.sql`)
4. Migrations run automatically on every Vercel deploy (`npm run db:migrate` in the build step)
5. Locally: `npm run db:migrate` to apply pending migrations

Migrations are idempotent — the runner skips already-applied files. Never edit a migration that has been deployed; always create a new one.

## Architecture: Dashboard + MCP Shared Data Layer

The dashboard and MCP server share a single data layer:
- `lib/brain/queries.ts` — all SQL, returns typed objects (ThoughtRecord, BrainStats, AlertItem)
- `lib/brain/tools.ts` — MCP tool functions, delegates to queries.ts, formats results as markdown
- `app/api/brain/*` — REST API routes for the dashboard, delegates to queries.ts, returns JSON
- `lib/auth/dashboard-auth.ts` — Clerk + email allowlist guard for API routes
- `app/dashboard/layout.tsx` — server-side auth gate (redirect if not signed in, "Not Authorized" if email not on allowlist)

Dashboard components are in `components/dashboard/`. UI primitives are shadcn/ui v4 (base-nova style, `@base-ui/react` — uses `render` prop, NOT `asChild`).

Tests are in `tests/` using vitest. Run with `pnpm test`.

## Brain Sync

Search terms: `second-brain`, `open-brain`, `dashboard`, `MCP server`, `thought capture`

## Feature Tracker

See `features.json` — 14 features tracked. P1 features complete (dashboard, search, alerts, inline edit, input coercion). P2 planned: project scoping (feat-112), session context capture (feat-113). See `SESSION-CONTEXT.md` for current state.
