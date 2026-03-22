# Session Context

## Status
- Nervous Center Phases 0-5 shipped and deployed. Brain is now agentic.
- Auto-capture active: SessionEnd, git post-commit, Vercel deploy webhook
- Morning briefing pipeline running (6 AM UTC daily)

## In-Flight
- Nothing in-flight — all phases shipped

## Key Details
- Auth: Clerk (dashboard), BRAIN_API_KEY (hooks/capture API), HMAC-SHA1 (Vercel webhook)
- DB: 4 tables (thoughts, projects, thought_edges, briefings) + services, 9 migrations
- Global git hooks: core.hooksPath → ~/.config/git/hooks (chains to per-repo .local)
- Claude hooks: SessionStart (brain context inject), SessionEnd (auto-capture)
- QStash + CRON_SECRET + VERCEL_WEBHOOK_SECRET all on Vercel
- 8 new MCP tools (projects, edges, briefings), won't appear until next session reconnect

## Next Steps
1. Phase 6: Sleep consolidation job (semantic clustering, stale edge detection, cross-project patterns)
2. Phase 7: D3 force graph visualization on dashboard
3. Dashboard UI for projects view and briefings view
4. Clean up the test milestone capture (ID: 903d64dc)
