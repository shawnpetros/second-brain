# Session Context

## Status
- Dashboard live at second-brain.shawnpetros.com, all P1 features shipped
- Nervous Center Phases 1-4 complete and deployed
- Projects are now self-aware: every Claude Code session auto-injects brain context

## In-Flight
- Nothing actively in-flight, all phases 1-4 shipped

## Key Details
- Auth: Clerk + email allowlist (dashboard), BRAIN_API_KEY (hook endpoint)
- DB: 3 tables (thoughts, projects, thought_edges) + services
- 13 projects seeded, 158 thoughts linked, 241 cross-cutting unassigned
- Edge types: relates_to, blocks, caused_by, inspired_by, contradicts, child_of
- 6 new MCP tools: list_projects, get_project_context, assign_thought_project, add_edge, list_edges, remove_edge
- Hook: ~/.claude/hooks/brain-project-context.mjs → SessionStart (startup|resume)
- Hook endpoint: /api/brain/hook/project-context?path= (BRAIN_API_KEY auth, plain text)

## Next Steps
1. Phase 5: Morning briefing QStash pipeline (reuse intel-brief pattern)
2. Phase 6: Sleep consolidation job (semantic clustering, stale edge detection)
3. Phase 7: D3 force graph visualization on dashboard
4. Dashboard UI for projects view (list projects, filter thoughts by project)
