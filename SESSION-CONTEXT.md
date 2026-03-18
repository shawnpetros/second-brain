# Session Context

## Status
- Dashboard live at second-brain.shawnpetros.com, all P1 features shipped
- New `services` table live in Neon, 4 MCP tools deployed (add/list/update/remove_service)
- 16 services seeded from full project audit; monthly costs not yet populated

## In-Flight
- MCP server needs restart to pick up new service inventory tools
- z.coerce fix still needs deploy to verify in production

## Key Details
- Auth: Clerk + email allowlist (shawn.petros@gmail.com, cindy.petros@gmail.com)
- DB migrations sequential .sql in src/migrations/, auto-run on Vercel deploy
- Services table is structured/relational (no embeddings), queryable by project/category/status
- Dashboard uses shadcn/ui v4 (base-nova style, @base-ui/react with `render` prop)

## Next Steps
1. Restart MCP server to pick up service inventory tools
2. Populate monthly_cost values from billing dashboards
3. Deploy to verify z.coerce fix + services migration runs on Vercel
4. Finish feat-002 (pass in triage) and feat-003 (SessionStart active tasks)
5. Plan feat-112 (project scoping) and feat-113 (session context capture)
