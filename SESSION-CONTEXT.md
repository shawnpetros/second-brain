# Session Context

## Status
- Autonomous Action Queue Phase 1: implementation in progress on `feat/action-queue` branch
- Tasks 1-3 complete (migration, permissions, urgency scoring — 28 tests passing)
- Tasks 4-14 remain — fully specified in implementation plan

## In-Flight
- `feat/action-queue` branch with 3 commits ahead of main
- Implementation plan: `docs/superpowers/plans/2026-03-22-autonomous-action-queue.md` (14 tasks, reviewed)
- Design spec: `docs/superpowers/specs/2026-03-22-autonomous-action-queue-design.md` (reviewed, all issues fixed)

## Key Details
- Auth: Clerk (dashboard), BRAIN_API_KEY (hooks/capture), HMAC-SHA1 (Vercel webhook)
- DB: 5 tables (thoughts, projects, thought_edges, briefings, services) + 3 new (pending_actions, permission_overrides, push_subscriptions via migration 010)
- New env vars needed: ANTHROPIC_API_KEY (required, fail-fast), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
- Model strategy: Sonnet 4.6 default, Opus 4.6 for high-stakes/sensitive drafts, briefing upgrading from gpt-4o-mini → Sonnet
- Embedding migration planned separately: OpenAI ada-002 → Voyage 3.5-large
- Subagent-driven development hit permission issues — implement tasks directly (faster)

## Next Steps
1. Task 4: Action Queries (CRUD for pending_actions — follow queries.ts patterns)
2. Task 5: Snooze Mechanism (queries.ts + API route + MCP tool)
3. Task 6: Metadata Extraction — add deadline field
4. Task 7: Task Classifier (Sonnet) — needs `npm install @anthropic-ai/sdk`
5. Task 8: Action Executor (route + QStash auth)
6. Task 9: Enhanced Briefing Pipeline (biggest task — full pipeline orchestration)
7. Tasks 10-14: Notifications, API routes, dashboard, integration, deploy
