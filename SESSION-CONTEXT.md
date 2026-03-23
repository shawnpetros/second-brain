# Session Context

## Status
- Action Queue Phase 1 COMPLETE and deployed. 4AM cron active. Penny is named and has her SOUL.md.
- agents table created, agent_id on pending_actions, Penny seeded as default agent.
- Daily focus + cadences wired into briefing. 3 cadences seeded for Monday.

## In-Flight
- 3 actions staged in approval queue (CSF email, attorney intake, Intel Brief recs)
- Tomorrow 4AM: first fully autonomous briefing with daily plate, cadences, and Penny's voice

## Key Details
- SOUL.md lives at ~/.claude/SOUL.md (global) AND /projects/second-brain/SOUL.md
- agents table seeded with Penny (id: 'penny', role: COO)
- Migration 013 applied (agent_id + agents table)
- RLS migration NOT YET DONE — first task next session

## Next Steps
1. RLS migration — add user_id + Row-Level Security to all tables (architectural principle, no app code changes)
2. Wire SOUL.md into agent system prompts (briefing, classifier, executor)
3. Multi-AI test — verify ChatGPT/Cursor can consume MCP or REST API
4. Review approval queue (3 staged actions)
5. Phase 2 planning: artifact routing, content pipeline convergence, team agents
