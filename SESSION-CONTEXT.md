# Session Context

## Status
- Nervous Center Phases 0-5 shipped. Brain is agentic and self-feeding.
- "Inbox zero" backfill: 428 git commits + 5 cowork sessions captured
- SessionEnd hook fixed (tail-read + fire-and-forget)
- Briefing dashboard page live at /dashboard/briefing

## In-Flight
- Nothing in-flight — all work shipped

## Key Details
- Auth: Clerk (dashboard), BRAIN_API_KEY (hooks/capture), HMAC-SHA1 (Vercel webhook)
- DB: 4 tables (thoughts, projects, thought_edges, briefings) + services, 9 migrations
- Global git hooks: core.hooksPath → ~/.config/git/hooks (chains to per-repo .local)
- Claude hooks: SessionStart (brain context inject), SessionEnd (auto-capture, fixed)
- QStash + CRON_SECRET + VERCEL_WEBHOOK_SECRET on Vercel
- Brain total: ~850+ thoughts after backfill (was 416 before)

## Next Steps
1. Set up Vercel deploy webhook in Dashboard (Settings → Webhooks → deployment.succeeded)
2. Phase 6: Sleep consolidation job
3. Phase 7: D3 force graph visualization
4. PWA push notifications for morning briefing
5. Mine remaining Claude Code session transcripts (111 sessions)
