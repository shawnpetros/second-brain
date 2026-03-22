# Session Context

## Status
- Nervous Center Phases 0-5 complete and deployed in single session
- Brain now auto-captures from 3 sources: session end, git commits, Vercel deploys
- Morning briefing pipeline live (6 AM UTC daily cron)
- 13 projects seeded, directed graph layer active

## In-Flight
- Nothing actively in-flight — all phases shipped

## Key Details
- Auth: Clerk (dashboard), BRAIN_API_KEY (hooks/webhooks/capture API)
- DB: 4 tables (thoughts, projects, thought_edges, briefings) + services
- Global hooks: SessionStart (brain context), SessionEnd (session capture)
- Git hooks: global core.hooksPath at ~/.config/git/hooks, chains to per-repo .local hooks
- intel-app pre-commit preserved as pre-commit.local
- QStash + CRON_SECRET configured on Vercel
- Vercel deploy webhook needs manual setup in Vercel Dashboard

## Next Steps
1. Configure Vercel deploy webhook in Dashboard (Settings → Webhooks → deployment.succeeded)
2. Phase 6: Sleep consolidation job (semantic clustering, stale edge detection)
3. Phase 7: D3 force graph visualization on dashboard
4. Dashboard UI for projects view and briefings view
