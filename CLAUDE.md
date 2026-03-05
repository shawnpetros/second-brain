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

## Task Management

Thoughts classified as `action_item` have a `status` lifecycle:
- **untriaged** — newly captured, not yet reviewed
- **active** — reviewed and acknowledged, but not yet done
- **completed** — done
- **skipped** — explicitly deferred

A SessionStart hook automatically checks for untriaged tasks and prompts the user to triage them (work on it, skip, or mark complete).
