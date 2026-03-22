# Autonomous Action Queue — Phase 1 Design Spec

**Date:** 2026-03-22
**Project:** second-brain (Open Brain)
**Status:** Approved design, pending implementation
**Estimated cost:** $7-15/month (Sonnet briefing + classification + 1-3 actions/day, occasional Opus)

---

## 1. Problem Statement

The second brain captures thoughts, tasks, and decisions effectively, but acts as a **passive thought portal** — it stores and surfaces, but never acts. The result:

- 14 untriaged tasks sitting for days/weeks
- Morning briefings flag the same stale items repeatedly with no resolution
- Tasks that the model could partially complete (research, drafting, analysis) still require full human effort
- No urgency differentiation — a task due tomorrow looks the same as a task from 3 weeks ago
- No mechanism for the agent to do "80% of the work" and present results for approval

## 2. Goal

Transform the second brain from a passive knowledge store into a **guardrail-bounded autonomous assistant** that:

1. **Triages** tasks with computed urgency scores and smart classification
2. **Acts** on tasks it can handle — research, drafting, analysis, summarization
3. **Stages** results in an approval queue for human review
4. **Escalates** stale tasks with increasing urgency until they're resolved or snoozed
5. **Never** takes destructive, external, or irreversible actions without explicit human approval

## 3. Architecture Overview

```
Stage 1: EVALUATE (daily cron)           Stage 2: ACT (QStash, 5 min delay)
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ /api/briefing/cron           │         │ /api/actions/execute?id=X    │
│                              │         │ (one invocation per action)  │
│ 1. Urgency scoring (code)   │ QStash  │                              │
│ 2. Task classification      │────────▶│ 1. Validate permission tier  │
│    (Sonnet)                  │ 3 msgs  │ 2. Select model              │
│ 3. Briefing generation      │ parallel│ 3. Execute task              │
│    (Sonnet)                  │         │ 4. Store result → staged     │
│ 4. Plan actions → insert    │         │ 5. Send PWA push             │
│    pending_actions (planned) │         │    notification              │
└──────────────────────────────┘         └──────────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Dashboard: Approval Queue    │
│ /dashboard/queue             │
│                              │
│ ┌─ NEEDS REVIEW (staged) ─┐ │
│ │ [Preview] [Approve]      │ │
│ │ [Reject] [Retry w/ note] │ │
│ └──────────────────────────┘ │
│ ┌─ AUTO-COMPLETED (auto) ─┐ │
│ │ [View full] [Flag issue] │ │
│ └──────────────────────────┘ │
│ ┌─ BLOCKED (never) ───────┐ │
│ │ [Snooze] [Complete]      │ │
│ │ [Skip]                   │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

## 4. Data Model

### 4.1 New Table: `pending_actions`

```sql
CREATE TABLE pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thought_id UUID NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
  briefing_id UUID REFERENCES briefings(id),
  action_type TEXT NOT NULL,
  permission_tier TEXT NOT NULL CHECK (permission_tier IN ('auto', 'staged', 'never')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned', 'executing', 'staged', 'approved', 'rejected',
    'expired', 'failed', 'blocked', 'abandoned', 'dismissed'
  )),
  stakes TEXT CHECK (stakes IN ('low', 'medium', 'high')),
  model_used TEXT,
  prompt_summary TEXT NOT NULL,
  prompt_adjustments TEXT,
  result TEXT,
  result_metadata JSONB DEFAULT '{}',
  urgency_score FLOAT DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  reviewed_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,
  failure_reason TEXT,
  parent_action_id UUID REFERENCES pending_actions(id),
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pending_actions_status ON pending_actions(status);
CREATE INDEX idx_pending_actions_thought ON pending_actions(thought_id);
CREATE INDEX idx_pending_actions_briefing ON pending_actions(briefing_id);

-- Prevent duplicate active actions for the same thought
CREATE UNIQUE INDEX idx_pending_actions_active_thought
  ON pending_actions(thought_id)
  WHERE status IN ('planned', 'executing', 'staged');

-- Auto-update updated_at on status changes (matches thoughts table pattern)
CREATE TRIGGER update_pending_actions_updated_at
  BEFORE UPDATE ON pending_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Column notes:**
- `briefing_id`: links actions to the briefing cycle that spawned them — simplifies debugging, cost tracking per cycle, and notification grouping
- `stakes`: populated from classification output, used by `selectModel()` to route to Opus for high-stakes drafts
- `prompt_adjustments`: user guidance from "Retry with note" — appended to the original `prompt_summary` as additional instruction when the executor builds the LLM prompt (not a replacement)
- `dismissed`: used when manually dismissing a failed action from the dashboard via [Dismiss] button (see §7.4)

### 4.2 Schema Additions to `thoughts`

```sql
ALTER TABLE thoughts ADD COLUMN urgency_score FLOAT DEFAULT 0;
ALTER TABLE thoughts ADD COLUMN urgency_updated_at TIMESTAMPTZ;
ALTER TABLE thoughts ADD COLUMN action_classification TEXT;
ALTER TABLE thoughts ADD COLUMN snoozed_until TIMESTAMPTZ;
ALTER TABLE thoughts ADD COLUMN snooze_count INT DEFAULT 0;
ALTER TABLE thoughts ADD COLUMN deadline TIMESTAMPTZ;
```

**Column notes:**
- `deadline`: extracted during metadata extraction (same prompt that pulls people, topics, action_items). Relative dates ("by Tuesday", "this week") are converted to absolute timestamps at capture time. Used for the `+3 has_deadline` urgency boost and deadline priority sorting (§5.2).

### 4.3 New Table: `push_subscriptions`

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  subscription JSONB NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.4 New Table: `permission_overrides`

```sql
CREATE TABLE permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT UNIQUE NOT NULL,
  override_tier TEXT NOT NULL CHECK (override_tier IN ('auto', 'staged')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'user'
);
```

### 4.5 Action Lifecycle

```
Task captured (untriaged)
    │
    ▼
Briefing cycle → classification + urgency scoring
    │
    ├── human_only → surfaces in briefing only
    ├── quick_win → surfaces as "knock these out" list
    └── auto_actionable / draft_needed
            │
            ▼
    pending_action created (status: planned)
            │
            ▼
    QStash dispatches to /api/actions/execute
            │
            ▼
    Executor runs (status: executing → staged)
            │
            ├── Success → staged + PWA notification
            └── Failure → retry via QStash (max 3 retries per dispatch)
                    │
                    ├── Transient error → same prompt, retry
                    └── After 3 QStash retries → failed
                            │
                            ▼
                    Next cycle: auto-retry with adjusted prompt
                    (max 2 cross-cycle retries, then abandoned)
            │
            ▼
    Dashboard: Approval Queue
            │
    ├── Approve → status: approved
    ├── Reject → status: rejected
    ├── Retry with note → new action (parent_action_id linked)
    ├── Flag issue → flagged: true (auto-completed items)
    ├── Dismiss → status: dismissed (failed/rejected actions, won't retry)
    └── Expire → status: expired (7 days, auto-cleanup)

**Expiration mechanism:** The daily briefing cycle (Stage 1) sweeps for expired actions as its first step: `UPDATE pending_actions SET status = 'expired' WHERE status = 'staged' AND expires_at < NOW()`. This runs before classification and action planning, so expired slots free up budget for new actions. Expiration is checked once per day, not in real-time — a staged action may display for up to ~24h past its `expires_at`, which is acceptable.
```

## 5. Urgency Scoring Engine

Pure code logic, no LLM. Runs as a function during the briefing cycle.

### 5.1 Formula

```
urgency_score = base_weight × age_multiplier + context_boosts

base_weight:
  action_item: 10
  decision:     7
  idea:         3
  insight:      2
  reference:    1

age_multiplier (steep curve):
  0-2 days:    1.0   (fresh)
  3-5 days:    2.0   (aging)
  6-10 days:   4.0   (stale)
  11-14 days:  8.0   (neglected)
  15-21 days: 15.0   (critical)
  21+ days:    FORCED RESOLUTION (see §5.3)

context_boosts (additive, stack):
  +3  has_deadline (deadline column on thoughts, extracted at capture)
  +2  mentions_person (someone is waiting)
  +2  has_blocking_edge (blocks another task in the graph)
  +1  referenced_in_briefing (was already flagged previously)
  +1  has_action_items (structured subtasks extracted)
```

**Snooze filter:** All queries that use urgency scoring, classification, or briefing data must exclude snoozed tasks with: `WHERE (snoozed_until IS NULL OR snoozed_until < NOW())`. This filter applies in at minimum 4 places: urgency scoring query, classification query (top 10 by urgency), `gatherBriefingData()` open tasks query, and action planning query.

### 5.2 Deadline Priority

Tasks with `deadline < now() + 48h` sort above all non-deadline tasks regardless of score.

### 5.3 Forced Resolution (21+ days)

Tasks older than 21 days trigger a forced choice in the briefing:

> **OVERDUE (21+ days) — must resolve:**
> - CSF leak complaint → Complete it, snooze it, or delete it.

The agent will not auto-act on these — they are `human_only` by virtue of being overdue. If the user doesn't act, the system keeps surfacing with increasingly blunt language.

### 5.4 Snooze Mechanism

- `snoozed_until`: tasks excluded from scoring, briefing, and action planning until date passes
- **Snooze does NOT reset the age clock** — a 10-day task snoozed for 5 days comes back as 15-day
- **Max 3 snoozes per task** (`snooze_count`). After 3, the system refuses: "Complete, delete, or work on it."
- **Allowed durations:** 2 days, 5 days, 7 days (not open-ended)
- Available from: dashboard, MCP tool (`snooze_task`), Telegram (Phase 2)

### 5.5 Snooze API

```
PATCH /api/brain/thoughts/{id}/snooze
Body: { "days": 2 | 5 | 7 }

Success: { "snoozed_until": "...", "snooze_count": 2, "snoozes_remaining": 1 }
Denied:  { "error": "max_snoozes_reached", "message": "..." }
```

MCP tool: `snooze_task(id, days)` — calls the same query function.

## 6. Permission Tiers

**The model never decides what's safe — the schema does.**

### 6.1 Tier Definitions

```
🟢 AUTO — Execute without approval gate
  research, summary, analysis, categorize, internal_note

🟡 STAGED — Execute, require approval before delivery
  draft_email, draft_message, draft_content, draft_report, recommendation

🔴 NEVER — Cannot execute, only surface with context
  send_email, send_message, financial, delete, deploy,
  schedule, purchase, auth
```

### 6.2 Tier Resolution (Code, Not LLM)

```typescript
const PERMISSION_TIERS: Record<string, 'auto' | 'staged' | 'never'> = {
  research:        'auto',
  summary:         'auto',
  analysis:        'auto',
  categorize:      'auto',
  internal_note:   'auto',
  draft_email:     'staged',
  draft_message:   'staged',
  draft_content:   'staged',
  draft_report:    'staged',
  recommendation:  'staged',
  send_email:      'never',
  send_message:    'never',
  financial:       'never',
  delete:          'never',
  deploy:          'never',
  schedule:        'never',
  purchase:        'never',
  auth:            'never',
};

function getPermissionTier(actionType: string): 'auto' | 'staged' | 'never' {
  const baseTier = PERMISSION_TIERS[actionType] ?? 'never'; // unknown = blocked
  if (baseTier === 'never') return 'never'; // never-tier cannot be overridden
  const override = getOverride(actionType);
  if (override && baseTier === 'staged') return override.override_tier;
  return baseTier;
}
```

### 6.3 Defense in Depth

1. **PERMISSION_TIERS lookup** — unknown type defaults to `never`
2. **Classification prompt constraint** — Sonnet instructed to only output from an explicit allowlist
3. **Executor validation** — re-checks tier before running. Even if a `never` action is somehow queued as `planned`, the executor refuses and sets `status: blocked`

### 6.4 Permission Overrides (Graduated Autonomy)

The `permission_overrides` table allows relaxing `staged → auto` per action type. **Never-tier actions cannot be overridden.**

- **Manual promotion:** Dashboard settings or MCP tool: `promote_action_type(type, 'auto')`
- **System suggestion (Phase 3):** After N consecutive approvals without edits, briefing suggests promotion
- **Demotion:** Delete the override row, instant revert to base tier

### 6.5 Flag-Based Quality Tracking

When a user flags a bad auto-completed result:

```
flag_rate (rolling 30-day window per action type):
  < 20%   → no action, one-off bad result
  >= 20%  → WARNING in briefing, suggest demotion
  >= 40%  → AUTO-DEMOTE to staged + briefing notification
```

Dashboard shows action type health (flag rates over 30 days).

**Query pattern:** `SELECT action_type, COUNT(*) FILTER (WHERE flagged) AS flags, COUNT(*) AS total FROM pending_actions WHERE permission_tier = 'auto' AND created_at > NOW() - INTERVAL '30 days' AND status IN ('staged', 'approved', 'expired') GROUP BY action_type`. At Phase 1 volume (1-3 actions/day) this scan is trivial. If volume increases in Phase 2+, add a materialized view or summary table.

## 7. Pipeline Detail

### 7.1 Stage 1: Evaluate (`/api/briefing/cron` — enhanced)

Runs on existing Vercel cron schedule. Changes from current:

1. **Urgency scoring** (code, no LLM): recalculate all action_item scores
2. **Classification** (Sonnet, new): top 10 tasks by urgency (excluding snoozed) → classify each. Two-level output:
   - `action_classification`: the "should we act?" flag — determines whether an action is created
     - `auto_actionable` → create pending_action (agent can complete without human input)
     - `draft_needed` → create pending_action (agent produces output for review)
     - `human_only` → no action created, surfaces in briefing only
     - `quick_win` → no action created, surfaces in "knock these out" briefing section
   - `action_type`: the "how do we act and what tier?" flag — determines permission tier via code lookup
     - Must be from the PERMISSION_TIERS allowlist (§6.2). Prompt constrains Sonnet to this list.
   - `prompt_summary`: what the agent should do (human-readable task description)
   - `stakes`: low | medium | high — stored on pending_action, used by `selectModel()` (§9.3)

   Note: `model_recommendation` is NOT part of the classification output. Model selection is deterministic code logic (§9.3), not an LLM suggestion.
3. **Briefing generation** (Sonnet, upgraded from gpt-4o-mini): new sections:
   - "Actions Staged" — what the agent is about to work on
   - "Quick Wins" — things you can knock out in 5 minutes
   - "Forced Resolution" — 21+ day tasks demanding a decision
4. **Action planning**: insert top 3 actionable tasks into `pending_actions` (status: planned)
5. **QStash dispatch**: publish 3 parallel messages to `/api/actions/execute?id=X` (5 min delay)

### 7.2 Stage 2: Act (`/api/actions/execute` — new route)

One Vercel function invocation per action (parallel via QStash). Each invocation:

1. **Verify QStash signature** using `@upstash/qstash` `Receiver` class (same pattern as `/api/briefing/generate`)
2. Read source thought (full text, metadata, edges) → build `ActionContext`
3. Validate permission tier (belt + suspenders check — re-derive from `action_type` via code lookup, refuse if `never`)
4. Select model via `selectModel(ctx)` (§9.3)
5. Build task-specific prompt based on `action_type`
6. Execute via Claude API (direct API call using `ANTHROPIC_API_KEY`, not `claude -p`)
7. Basic quality check: response length > 100 chars, no refusal phrases
8. Store result in `pending_actions` (status: staged or failed)
9. Track: tokens in/out, cost, model, latency in `result_metadata`
10. **Send individual PWA push notification** per staged action (not batched — each executor is independent and doesn't know about siblings)

**Environment requirement:** `ANTHROPIC_API_KEY` must be added to `lib/env.ts` validation and Vercel environment variables.

### 7.3 Constraints

- **Max 3 actions per cycle** — prevents runaway cost
- **`maxDuration = 120`** on the executor route — Opus drafts can take 30-45s for the API call alone, and 60s is too tight with network overhead + DB writes. 120s gives breathing room on Pro plan. (Hobby tier caps at 60s — if on Hobby, Opus actions will rely on the retry mechanism more heavily.)
- **No chaining** — actions don't trigger other actions
- **Classification re-runs each cycle** — no stale cached classifications
- **Duplicate prevention** — before inserting a new `pending_action`, the partial unique index `idx_pending_actions_active_thought` prevents creating actions for thoughts that already have one in `planned`, `executing`, or `staged` status

### 7.4 Failure Recovery

**Within a cycle (QStash retries):**
- 3 retry attempts with exponential backoff
- After 3 failures: `status: failed`, error in `result_metadata`

**Across cycles (smart retry):**
- Next day's Action Planner checks for failed actions
- `timeout` → scoped-down prompt ("brief summary, under 300 words")
- `low_quality` → rephrased prompt with more structure
- `api_error` → same prompt, just retry
- `retry_count >= 2` → `status: abandoned`, reclassified as `human_only`
- Failed retries count against the daily 3-action budget (lower priority than new actions)

**Manual re-trigger (dashboard):**
- Failed/rejected actions show [Retry] and [Retry with note] buttons
- "Retry with note" appends user guidance to the prompt
- Creates new `pending_action` linked via `parent_action_id`
- Normal QStash → execute → stage flow

## 8. Notifications

### 8.1 PWA Push (Phase 1)

```
When to notify:
  ✓ Staged actions ready for review → immediate push
  ✓ Forced resolution tasks (21+ days) → morning push with briefing
  ✗ Auto-completed actions (show in queue, don't push)
  ✗ Snooze confirmations
  ✗ Routine briefing
```

Implementation:
- Web Push API via service worker
- `/api/notifications/subscribe` endpoint → stores subscription in `push_subscriptions`
- `sendPushNotification(userId, payload)` utility called by executor and briefing

### 8.2 Notification Abstraction (Phase 2 ready)

```typescript
async function notify(userId: string, payload: NotificationPayload) {
  const channels = await getActiveChannels(userId);
  for (const channel of channels) {
    switch (channel.type) {
      case 'web_push': await sendWebPush(channel, payload); break;
      case 'telegram': await sendTelegram(channel, payload); break;
    }
  }
}
```

Phase 2 replaces `push_subscriptions` with a `notification_channels` table supporting multiple channel types, priority levels (`urgent_only` | `all`), and per-channel config.

## 9. Model Strategy

### 9.1 Model Assignments

| Role | Current | Phase 1 | Cost |
|---|---|---|---|
| Briefing generation | gpt-4o-mini | Sonnet 4.6 | $0.04/cycle |
| Task classification | N/A (new) | Sonnet 4.6 | $0.02/cycle |
| Research/summary/analysis | N/A (new) | Sonnet 4.6 | $0.04/action |
| High-stakes drafting | N/A (new) | Opus 4.6 | $0.10/action |
| Heartbeat evaluation | N/A (Phase 2) | Haiku 4.5 or local model | $0.005/tick |
| Embeddings | OpenAI ada-002 | Voyage 3.5-large | Migration (see §9.2) |

### 9.2 Embedding Migration (Separate PR)

- Current: OpenAI text-embedding-ada-002 (1536 dim)
- Target: Voyage 3.5-large (best for technical content retrieval)
- Steps: add Voyage API key → update embedding function → backfill script → verify search quality
- Estimated cost: ~$0.10 (one-time, ~500 thoughts)
- Non-blocking: runs independently of action queue work

### 9.3 Model Selection Logic

The executor reads the source thought (step 1 of §7.2) and builds an enriched context object. `selectModel` operates on this enriched object, not solely on the `pending_actions` record:

```typescript
// Built by the executor after reading the source thought
interface ActionContext {
  action: PendingAction;        // from pending_actions table
  sourceThought: ThoughtRecord; // from thoughts table (has topics, people, etc.)
}

function selectModel(ctx: ActionContext): string {
  const { action, sourceThought } = ctx;

  // Opus for high-stakes drafts
  if (action.action_type.startsWith('draft_') && action.stakes === 'high') {
    return 'opus-4.6';
  }
  // Opus for sensitive topics (checked on source thought's topics)
  const sensitiveTopic = sourceThought.topics?.some(t =>
    ['medical', 'legal', 'financial', 'compliance'].includes(t)
  );
  if (sensitiveTopic && action.permission_tier === 'staged') {
    return 'opus-4.6';
  }
  // Everything else
  return 'sonnet-4.6';
}
```

## 10. Dashboard: Approval Queue

New page at `/dashboard/queue` with three sections:

### 10.1 Needs Review (staged)
- Full preview of result
- Action buttons: [Approve] [Reject] [Retry with note]
- Metadata: model used, urgency score, cost, timestamps

### 10.2 Auto-Completed (auto, green checkmark)
- Collapsed view, expandable
- [View full] [Flag issue] buttons
- Auto-archive after 48 hours if not flagged

### 10.3 Blocked (never/human_only)
- Context about why it's blocked
- [Snooze 2d] [Snooze 5d] [Snooze 1w] [Complete] [Skip] buttons

### 10.4 Settings Section
- Action type health (flag rates over 30 days)
- Permission overrides management (promote/demote)

## 11. New MCP Tools

```
snooze_task(id, days)
  - days: 2 | 5 | 7
  - Fails if snooze_count >= 3
  - Returns: { snoozed_until, snooze_count, snoozes_remaining }

list_pending_actions(status?)
  - Default: 'staged'
  - Returns: pending actions with summaries

approve_action(id)
  - Sets status to 'approved'

reject_action(id, reason?)
  - Sets status to 'rejected', stores reason
```

## 12. Phase 2+ Roadmap (Not in scope, informs architecture)

- **Heartbeat daemon** (Mac Mini) — local Node.js process, 15-min ticks, local model for evaluation
- **Telegram bot** — bidirectional: notifications out, "do this on next tick" commands in, snooze inline buttons
- **`claude -p` dispatch** — for complex multi-tool tasks that need Claude Code's full capabilities
- **Graduated autonomy** — system suggests tier promotions based on approval patterns
- **Learning loop** — what actions get approved/rejected shapes future classification
- **Skill system** — modular capability definitions (like OpenClaw's SKILL.md pattern)
- **Cross-project orchestration** — content pipeline feeds brain feeds briefing feeds actions
- **Notification channels table** — replaces `push_subscriptions` with multi-channel support

## 13. Cost Estimate

```
Daily (typical):
  Briefing (Sonnet):        $0.04
  Classification (Sonnet):  $0.02
  1 research (Sonnet):      $0.04
  1 draft (Opus):           $0.10
  1 summary (Sonnet):       $0.02
  ─────────────────────────
  Total:                    ~$0.22/day

Monthly: $6-10 (typical), up to $15 (heavy action days)
```

No new infrastructure costs — runs entirely on existing Vercel + QStash + Postgres.
