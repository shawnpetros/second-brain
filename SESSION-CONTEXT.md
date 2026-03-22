# Session Context

## Status
- Dashboard live at second-brain.shawnpetros.com, all P1 features shipped
- Nervous Center Phases 1-3 complete: projects table, edges table, graph context API, 6 new MCP tools
- 13 projects seeded, 158 thoughts linked to projects, 241 cross-cutting thoughts unassigned

## In-Flight
- Need to deploy to Vercel so migrations 006-008 run in production
- Phase 4 (global CLAUDE.md hook for auto-inject) is next — the payoff phase

## Key Details
- Auth: Clerk + email allowlist (shawn.petros@gmail.com, cindy.petros@gmail.com)
- DB migrations sequential .sql in src/migrations/, auto-run on Vercel deploy
- New tables: projects (13 seeded), thought_edges (empty, ready for relationships)
- Edge types: relates_to, blocks, caused_by, inspired_by, contradicts, child_of
- New MCP tools: list_projects, get_project_context, assign_thought_project, add_edge, list_edges, remove_edge
- REST endpoints: /api/brain/projects, /api/brain/projects/[slug]/context
- Dashboard uses shadcn/ui v4 (base-nova style, @base-ui/react with `render` prop)

## Next Steps
1. Deploy to Vercel (migrations auto-run, MCP tools go live)
2. Build Phase 4: global CLAUDE.md hook to auto-fetch project context on session start
3. Plan Phase 5: morning briefing QStash pipeline
4. Plan Phase 6: sleep consolidation job
5. Plan Phase 7: D3 force graph visualization on dashboard
