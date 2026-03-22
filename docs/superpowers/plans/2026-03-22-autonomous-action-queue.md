# Autonomous Action Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the second brain from a passive knowledge store into a guardrail-bounded autonomous assistant that triages, acts on, and stages tasks for approval.

**Architecture:** Daily cron triggers urgency scoring (code) → task classification (Sonnet) → briefing generation (Sonnet) → action planning → parallel QStash dispatch → executor functions (Sonnet/Opus) → results staged in Postgres → approval queue dashboard with PWA push notifications.

**Tech Stack:** Next.js 15, Neon Postgres, QStash, Anthropic Claude API (Sonnet 4.6 / Opus 4.6), Web Push API, Vitest

**Spec:** `docs/superpowers/specs/2026-03-22-autonomous-action-queue-design.md`

---

## File Map

### New Files
| File | Responsibility |
|---|---|
| `src/migrations/010_action_queue.sql` | pending_actions table, permission_overrides table, push_subscriptions table, thoughts column additions |
| `lib/brain/urgency.ts` | Urgency scoring engine (pure code, no LLM) |
| `lib/brain/classifier.ts` | Task classification via Sonnet — outputs action_classification, action_type, stakes |
| `lib/brain/action-executor.ts` | Builds task-specific prompts, calls Claude API, returns result |
| `lib/brain/permissions.ts` | Permission tier lookup table, getPermissionTier(), selectModel() |
| `lib/brain/action-queries.ts` | CRUD for pending_actions table (insert, update status, query by status, flag, expire sweep) |
| `lib/notifications/push.ts` | Web Push subscription management + send utility |
| `app/api/actions/execute/route.ts` | QStash-triggered executor — one action per invocation |
| `app/api/notifications/subscribe/route.ts` | Store/remove push subscriptions |
| `app/api/brain/thoughts/[id]/snooze/route.ts` | Snooze endpoint |
| `app/api/brain/actions/route.ts` | List/query pending actions |
| `app/api/brain/actions/[id]/route.ts` | Approve/reject/flag/dismiss actions |
| `app/api/brain/actions/[id]/retry/route.ts` | Retry action with optional note |
| `app/dashboard/queue/page.tsx` | Approval queue page |
| `components/dashboard/action-card.tsx` | Action display card with approval/reject/flag buttons |
| `components/dashboard/queue-sections.tsx` | Needs Review / Auto-Completed / Blocked sections |
| `tests/lib/brain/urgency.test.ts` | Urgency scoring tests |
| `tests/lib/brain/permissions.test.ts` | Permission tier tests |
| `tests/lib/brain/classifier.test.ts` | Classification output validation tests |
| `tests/lib/brain/action-queries.test.ts` | Action CRUD tests |
| `tests/api/actions/execute.test.ts` | Executor route tests |
| `tests/api/brain/snooze.test.ts` | Snooze endpoint tests |
| `tests/lib/brain/metadata.test.ts` | Deadline extraction tests |
| `tests/lib/notifications/push.test.ts` | Push notification tests (send, 410 cleanup) |

### Modified Files
| File | Changes |
|---|---|
| `lib/env.ts` | Add ANTHROPIC_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY |
| `lib/brain/queries.ts` | Add snoozeTask(), add snoozed_until filter to gatherBriefingData queries |
| `lib/brain/tools.ts` | Add snooze_task, list_pending_actions, approve_action, reject_action MCP tools |
| `lib/brain/metadata.ts` | Add `deadline` field to extraction prompt and ThoughtMetadata interface |
| `lib/brain/briefing.ts` | Swap gpt-4o-mini → Sonnet (Anthropic SDK), add new briefing sections, integrate urgency + classification |
| `app/api/briefing/generate/route.ts` | Pipeline orchestrator: urgency scoring → classification → briefing generation → action planning → QStash dispatch |
| `app/api/briefing/cron/route.ts` | Thin dispatcher (unchanged pattern — publishes to QStash which calls generate) |
| `app/api/mcp/route.ts` | Register new MCP tools |
| `app/dashboard/layout.tsx` | Add Queue nav link |
| `vercel.json` | No change needed (same cron, actions dispatched via QStash from within cron handler) |

---

## Task 1: Database Migration

**Files:**
- Create: `src/migrations/010_action_queue.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 010: Autonomous Action Queue schema
-- Adds pending_actions, permission_overrides, push_subscriptions tables
-- Adds urgency/snooze/deadline columns to thoughts

-- 1. New columns on thoughts
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS urgency_score FLOAT DEFAULT 0;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS urgency_updated_at TIMESTAMPTZ;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS action_classification TEXT;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS snooze_count INT DEFAULT 0;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

-- 2. pending_actions table
CREATE TABLE IF NOT EXISTS pending_actions (
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

CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_thought ON pending_actions(thought_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_briefing ON pending_actions(briefing_id);

-- Prevent duplicate active actions for the same thought
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_actions_active_thought
  ON pending_actions(thought_id)
  WHERE status IN ('planned', 'executing', 'staged');

-- Reuse existing update_updated_at() trigger from 001_schema.sql
DROP TRIGGER IF EXISTS update_pending_actions_updated_at ON pending_actions;
CREATE TRIGGER update_pending_actions_updated_at
  BEFORE UPDATE ON pending_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. permission_overrides table
CREATE TABLE IF NOT EXISTS permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT UNIQUE NOT NULL,
  override_tier TEXT NOT NULL CHECK (override_tier IN ('auto', 'staged')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'user'
);

-- 4. push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  subscription JSONB NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: Run migration locally**

Run: `npm run db:migrate`
Expected: "Applied migration: 010_action_queue.sql"

- [ ] **Step 3: Verify tables exist**

Run: `psql $DATABASE_URL -c "\dt pending_actions; \dt permission_overrides; \dt push_subscriptions; \d thoughts" | head -40`
Expected: All three tables listed, thoughts has new columns

- [ ] **Step 4: Commit**

```bash
git add src/migrations/010_action_queue.sql
git commit -m "feat: add action queue schema (migration 010)"
```

---

## Task 2: Permission Tiers (Pure Code, No Dependencies)

**Files:**
- Create: `lib/brain/permissions.ts`
- Create: `tests/lib/brain/permissions.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/brain/permissions.test.ts
import { describe, it, expect } from "vitest";
import { getPermissionTier, selectModel, PERMISSION_TIERS } from "@/lib/brain/permissions";

describe("getPermissionTier", () => {
  it("returns auto for research", () => {
    expect(getPermissionTier("research")).toBe("auto");
  });

  it("returns staged for draft_email", () => {
    expect(getPermissionTier("draft_email")).toBe("staged");
  });

  it("returns never for send_email", () => {
    expect(getPermissionTier("send_email")).toBe("never");
  });

  it("returns never for unknown action types (fail closed)", () => {
    expect(getPermissionTier("hack_the_planet")).toBe("never");
  });

  it("never-tier cannot be overridden", () => {
    // Even with an override record, never stays never
    expect(getPermissionTier("send_email", { send_email: "auto" })).toBe("never");
  });

  it("staged can be overridden to auto", () => {
    expect(getPermissionTier("draft_content", { draft_content: "auto" })).toBe("auto");
  });

  it("auto cannot be overridden (already lowest gate)", () => {
    expect(getPermissionTier("research", { research: "staged" })).toBe("auto");
  });
});

describe("selectModel", () => {
  const baseCtx = {
    action: { action_type: "research", stakes: "low" as const, permission_tier: "auto" as const },
    sourceThought: { topics: ["coding", "tools"] },
  };

  it("returns sonnet for standard research", () => {
    expect(selectModel(baseCtx)).toBe("claude-sonnet-4-6-20250514");
  });

  it("returns opus for high-stakes drafts", () => {
    const ctx = {
      action: { action_type: "draft_email", stakes: "high" as const, permission_tier: "staged" as const },
      sourceThought: { topics: ["client", "proposal"] },
    };
    expect(selectModel(ctx)).toBe("claude-opus-4-6-20250514");
  });

  it("returns opus for medical topics in staged tier", () => {
    const ctx = {
      action: { action_type: "draft_email", stakes: "medium" as const, permission_tier: "staged" as const },
      sourceThought: { topics: ["medical", "CSF leak"] },
    };
    expect(selectModel(ctx)).toBe("claude-opus-4-6-20250514");
  });

  it("does not use opus for auto-tier even with sensitive topics", () => {
    const ctx = {
      action: { action_type: "research", stakes: "medium" as const, permission_tier: "auto" as const },
      sourceThought: { topics: ["medical", "research"] },
    };
    expect(selectModel(ctx)).toBe("claude-sonnet-4-6-20250514");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/brain/permissions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement permissions module**

```typescript
// lib/brain/permissions.ts

export const PERMISSION_TIERS: Record<string, "auto" | "staged" | "never"> = {
  research: "auto",
  summary: "auto",
  analysis: "auto",
  categorize: "auto",
  internal_note: "auto",
  draft_email: "staged",
  draft_message: "staged",
  draft_content: "staged",
  draft_report: "staged",
  recommendation: "staged",
  send_email: "never",
  send_message: "never",
  financial: "never",
  delete: "never",
  deploy: "never",
  schedule: "never",
  purchase: "never",
  auth: "never",
};

export const ACTION_TYPE_ALLOWLIST = Object.keys(PERMISSION_TIERS);

const SENSITIVE_TOPICS = ["medical", "legal", "financial", "compliance"];

export function getPermissionTier(
  actionType: string,
  overrides?: Record<string, string>
): "auto" | "staged" | "never" {
  const baseTier = PERMISSION_TIERS[actionType] ?? "never";
  if (baseTier === "never") return "never";
  if (baseTier === "auto") return "auto";
  // Only staged can be overridden, and only to auto
  if (overrides && overrides[actionType] === "auto" && baseTier === "staged") {
    return "auto";
  }
  return baseTier;
}

export interface ActionContext {
  action: {
    action_type: string;
    stakes: "low" | "medium" | "high";
    permission_tier: "auto" | "staged" | "never";
  };
  sourceThought: {
    topics?: string[];
  };
}

export function selectModel(ctx: ActionContext): string {
  const { action, sourceThought } = ctx;

  // Opus for high-stakes drafts
  if (action.action_type.startsWith("draft_") && action.stakes === "high") {
    return "claude-opus-4-6-20250514";
  }

  // Opus for sensitive topics in staged tier only
  const hasSensitiveTopic = sourceThought.topics?.some((t) =>
    SENSITIVE_TOPICS.includes(t.toLowerCase())
  );
  if (hasSensitiveTopic && action.permission_tier === "staged") {
    return "claude-opus-4-6-20250514";
  }

  return "claude-sonnet-4-6-20250514";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/brain/permissions.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/brain/permissions.ts tests/lib/brain/permissions.test.ts
git commit -m "feat: add permission tiers with model selection logic"
```

---

## Task 3: Urgency Scoring Engine

**Files:**
- Create: `lib/brain/urgency.ts`
- Create: `tests/lib/brain/urgency.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/brain/urgency.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateUrgencyScore, getAgeMultiplier, isForceResolution, isSnoozed } from "@/lib/brain/urgency";

describe("getAgeMultiplier", () => {
  it("returns 1.0 for 0-2 day old items", () => {
    expect(getAgeMultiplier(0)).toBe(1.0);
    expect(getAgeMultiplier(1)).toBe(1.0);
    expect(getAgeMultiplier(2)).toBe(1.0);
  });

  it("returns 2.0 for 3-5 day old items", () => {
    expect(getAgeMultiplier(3)).toBe(2.0);
    expect(getAgeMultiplier(5)).toBe(2.0);
  });

  it("returns 4.0 for 6-10 day old items", () => {
    expect(getAgeMultiplier(6)).toBe(4.0);
    expect(getAgeMultiplier(10)).toBe(4.0);
  });

  it("returns 8.0 for 11-14 day old items", () => {
    expect(getAgeMultiplier(11)).toBe(8.0);
    expect(getAgeMultiplier(14)).toBe(8.0);
  });

  it("returns 15.0 for 15-21 day old items", () => {
    expect(getAgeMultiplier(15)).toBe(15.0);
    expect(getAgeMultiplier(21)).toBe(15.0);
  });

  it("returns 15.0 for 21+ day items (force resolution handles these)", () => {
    expect(getAgeMultiplier(30)).toBe(15.0);
  });
});

describe("isForceResolution", () => {
  it("returns true for items older than 21 days", () => {
    expect(isForceResolution(22)).toBe(true);
  });

  it("returns false for items 21 days or younger", () => {
    expect(isForceResolution(21)).toBe(false);
    expect(isForceResolution(5)).toBe(false);
  });
});

describe("isSnoozed", () => {
  it("returns true when snoozed_until is in the future", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isSnoozed(future)).toBe(true);
  });

  it("returns false when snoozed_until is in the past", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isSnoozed(past)).toBe(false);
  });

  it("returns false when snoozed_until is null", () => {
    expect(isSnoozed(null)).toBe(false);
  });
});

describe("calculateUrgencyScore", () => {
  it("scores a fresh action_item at base weight", () => {
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 0,
      people: [],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: null,
    });
    expect(score).toBe(10); // base 10 * age 1.0 + 0 boosts
  });

  it("scores a 6-day action_item with person at 42", () => {
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 6,
      people: ["RJ"],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: null,
    });
    expect(score).toBe(42); // base 10 * age 4.0 + 2 person
  });

  it("applies deadline boost", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 1,
      people: [],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: tomorrow,
    });
    expect(score).toBe(13); // base 10 * age 1.0 + 3 deadline
  });

  it("does not apply deadline boost if deadline is far away", () => {
    const farFuture = new Date(Date.now() + 7 * 86400000).toISOString();
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 1,
      people: [],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: farFuture,
    });
    expect(score).toBe(10); // no deadline boost (>48h away)
  });

  it("stacks all boosts", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const score = calculateUrgencyScore({
      thought_type: "action_item",
      age_days: 1,
      people: ["Alice"],
      has_blocking_edge: true,
      referenced_in_briefing: true,
      action_items: ["do thing"],
      deadline: tomorrow,
    });
    // base 10 * age 1.0 + 3 deadline + 2 person + 2 blocking + 1 briefing + 1 action_items = 19
    expect(score).toBe(19);
  });

  it("uses lower base weight for ideas", () => {
    const score = calculateUrgencyScore({
      thought_type: "idea",
      age_days: 6,
      people: [],
      has_blocking_edge: false,
      referenced_in_briefing: false,
      action_items: [],
      deadline: null,
    });
    expect(score).toBe(12); // base 3 * age 4.0 + 0
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/brain/urgency.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement urgency module**

```typescript
// lib/brain/urgency.ts

const BASE_WEIGHTS: Record<string, number> = {
  action_item: 10,
  decision: 7,
  idea: 3,
  insight: 2,
  reference: 1,
};

const AGE_BRACKETS: [number, number][] = [
  [2, 1.0],
  [5, 2.0],
  [10, 4.0],
  [14, 8.0],
  [Infinity, 15.0],
];

const DEADLINE_BOOST_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

export function getAgeMultiplier(ageDays: number): number {
  for (const [maxDays, multiplier] of AGE_BRACKETS) {
    if (ageDays <= maxDays) return multiplier;
  }
  return 15.0;
}

export function isForceResolution(ageDays: number): boolean {
  return ageDays > 21;
}

export function isSnoozed(snoozedUntil: string | null): boolean {
  if (!snoozedUntil) return false;
  return new Date(snoozedUntil) > new Date();
}

export interface UrgencyInput {
  thought_type: string;
  age_days: number;
  people: string[];
  has_blocking_edge: boolean;
  referenced_in_briefing: boolean;
  action_items: string[];
  deadline: string | null;
}

export function calculateUrgencyScore(input: UrgencyInput): number {
  const base = BASE_WEIGHTS[input.thought_type] ?? 1;
  const ageMult = getAgeMultiplier(input.age_days);

  let boosts = 0;

  // +3 deadline within 48h
  if (input.deadline) {
    const deadlineMs = new Date(input.deadline).getTime();
    const nowMs = Date.now();
    if (deadlineMs - nowMs < DEADLINE_BOOST_WINDOW_MS && deadlineMs > nowMs) {
      boosts += 3;
    }
  }

  // +2 mentions person
  if (input.people.length > 0) boosts += 2;

  // +2 has blocking edge
  if (input.has_blocking_edge) boosts += 2;

  // +1 referenced in previous briefing
  if (input.referenced_in_briefing) boosts += 1;

  // +1 has extracted action items
  if (input.action_items.length > 0) boosts += 1;

  return base * ageMult + boosts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/brain/urgency.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/brain/urgency.ts tests/lib/brain/urgency.test.ts
git commit -m "feat: add urgency scoring engine with steep decay curve"
```

---

## Task 4: Action Queries (CRUD for pending_actions)

**Files:**
- Create: `lib/brain/action-queries.ts`
- Create: `tests/lib/brain/action-queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Test patterns should mirror the existing `tests/lib/brain/queries.test.ts` — mock Neon with `createTaggedMock`, mock `@/lib/env`.

Representative test (implement all 8 cases following this pattern):

```typescript
// tests/lib/brain/action-queries.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { neon } from "@neondatabase/serverless";
import { insertPendingAction, queryActionsByStatus, queryActionByThoughtId, updateActionStatus, flagAction, expireStaledActions, getActionTypeHealth, queryActionById } from "@/lib/brain/action-queries";

vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => createTaggedMock([])),
}));
vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgresql://test" },
}));

function createTaggedMock(returnValue: unknown[]) {
  const fn = vi.fn().mockResolvedValue(returnValue);
  fn.unsafe = vi.fn().mockResolvedValue(returnValue);
  return fn;
}

describe("insertPendingAction", () => {
  it("inserts and returns the new action record", async () => {
    const mockAction = { id: "abc-123", thought_id: "t-1", action_type: "research", status: "planned" };
    vi.mocked(neon).mockReturnValue(createTaggedMock([mockAction]));
    const result = await insertPendingAction({
      thought_id: "t-1", action_type: "research", permission_tier: "auto",
      prompt_summary: "Research topic X", stakes: "low", urgency_score: 20,
    });
    expect(result).toEqual(mockAction);
  });
});

describe("queryActionByThoughtId", () => {
  it("returns null when no active action exists for thought", async () => {
    vi.mocked(neon).mockReturnValue(createTaggedMock([]));
    const result = await queryActionByThoughtId("t-1", true);
    expect(result).toBeNull();
  });

  it("returns existing action when one is active", async () => {
    const mockAction = { id: "a-1", thought_id: "t-1", status: "staged" };
    vi.mocked(neon).mockReturnValue(createTaggedMock([mockAction]));
    const result = await queryActionByThoughtId("t-1", true);
    expect(result).toEqual(mockAction);
  });
});

// ... implement remaining 6 test cases following same pattern:
// updateActionStatus: verify status change returns updated record
// queryActionsByStatus: verify filter by status with limit
// flagAction: verify sets flagged=true and flag_reason
// expireStaledActions: verify updates expired staged actions
// getActionTypeHealth: verify returns {action_type, flags, total} aggregation
// queryActionById: verify returns single action or null
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/brain/action-queries.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement action-queries module**

Pattern: Follow `lib/brain/queries.ts` exactly — use `neon()` from `@neondatabase/serverless`, tagged template literals, return typed objects.

Key types:
```typescript
export interface PendingActionRecord {
  id: string;
  thought_id: string;
  briefing_id: string | null;
  action_type: string;
  permission_tier: "auto" | "staged" | "never";
  status: string;
  stakes: "low" | "medium" | "high" | null;
  model_used: string | null;
  prompt_summary: string;
  prompt_adjustments: string | null;
  result: string | null;
  result_metadata: Record<string, unknown>;
  urgency_score: number;
  expires_at: string;
  reviewed_at: string | null;
  retry_count: number;
  failure_reason: string | null;
  parent_action_id: string | null;
  flagged: boolean;
  flag_reason: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/brain/action-queries.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/brain/action-queries.ts tests/lib/brain/action-queries.test.ts
git commit -m "feat: add pending_actions CRUD query layer"
```

---

## Task 5: Snooze Mechanism

**Files:**
- Modify: `lib/brain/queries.ts` — add `snoozeTask()`, update snoozed_until filters
- Create: `app/api/brain/thoughts/[id]/snooze/route.ts`
- Modify: `lib/brain/tools.ts` — add `snooze_task` MCP tool
- Modify: `app/api/mcp/route.ts` — register snooze_task tool
- Create: `tests/api/brain/snooze.test.ts`

- [ ] **Step 1: Write snooze test**

Test cases:
- `PATCH /api/brain/thoughts/{id}/snooze` with `{ days: 5 }` → returns snoozed_until, snooze_count, snoozes_remaining
- Rejects invalid days (3, 10, etc.)
- Rejects when snooze_count >= 3
- Requires dashboard auth

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/brain/snooze.test.ts`
Expected: FAIL

- [ ] **Step 3: Add snoozeTask to queries.ts**

Add to `lib/brain/queries.ts`:
```typescript
export async function snoozeTask(
  id: string,
  days: 2 | 5 | 7
): Promise<{ snoozed_until: string; snooze_count: number; snoozes_remaining: number } | null> {
  const sql = neon(env.DATABASE_URL);
  // Check current snooze_count
  const [thought] = await sql`
    SELECT snooze_count FROM thoughts WHERE id = ${id} AND thought_type = 'action_item'
  `;
  if (!thought) return null;
  if (thought.snooze_count >= 3) {
    throw new Error("max_snoozes_reached");
  }
  const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
  const newCount = thought.snooze_count + 1;
  await sql`
    UPDATE thoughts
    SET snoozed_until = ${snoozedUntil},
        snooze_count = ${newCount},
        action_classification = NULL
    WHERE id = ${id}
  `;
  return {
    snoozed_until: snoozedUntil,
    snooze_count: newCount,
    snoozes_remaining: 3 - newCount,
  };
}
```

- [ ] **Step 4: Add snoozed_until filter to gatherBriefingData queries**

In `lib/brain/queries.ts`, update the `gatherBriefingData()` function. Add `AND (snoozed_until IS NULL OR snoozed_until < NOW())` to:
- Open tasks query (untriaged + active action_items)
- Stale tasks query
- Any query feeding into classification or action planning

- [ ] **Step 5: Create snooze API route**

```typescript
// app/api/brain/thoughts/[id]/snooze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { snoozeTask } from "@/lib/brain/queries";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireDashboardAuth();
  if (authError) return authError;

  const { id } = await params;
  const { days } = await req.json();

  if (![2, 5, 7].includes(days)) {
    return NextResponse.json(
      { error: "invalid_duration", message: "Days must be 2, 5, or 7" },
      { status: 400 }
    );
  }

  try {
    const result = await snoozeTask(id, days);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "max_snoozes_reached") {
      return NextResponse.json(
        { error: "max_snoozes_reached", message: "Snoozed 3 times already. Complete, delete, or work on it." },
        { status: 422 }
      );
    }
    throw e;
  }
}
```

- [ ] **Step 6: Add snooze_task MCP tool to tools.ts and register in mcp/route.ts**

Follow existing tool patterns in `lib/brain/tools.ts`. Add:
```typescript
export async function snoozeTaskTool(thoughtId: string, days: number): Promise<string> {
  // validate days, call snoozeTask, return formatted markdown
}
```

Register in `app/api/mcp/route.ts` with Zod schema:
```typescript
z.object({
  thought_id: z.string().describe("UUID of the task to snooze"),
  days: z.coerce.number().describe("Snooze duration: 2, 5, or 7 days"),
})
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/api/brain/snooze.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add lib/brain/queries.ts app/api/brain/thoughts/\[id\]/snooze/route.ts lib/brain/tools.ts app/api/mcp/route.ts tests/api/brain/snooze.test.ts
git commit -m "feat: add snooze mechanism with 3-snooze cap and MCP tool"
```

---

## Task 6: Metadata Extraction — Add Deadline Field

**Files:**
- Modify: `lib/brain/metadata.ts` — add `deadline` to extraction prompt and interface
- Modify: `lib/brain/queries.ts` — write deadline column on insert
- Create: `tests/lib/brain/metadata.test.ts` — deadline extraction validation

- [ ] **Step 1: Write failing test for deadline extraction**

```typescript
// tests/lib/brain/metadata.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { OPENAI_API_KEY: "test-key" },
}));

describe("ThoughtMetadata interface", () => {
  it("includes deadline field", async () => {
    // Mock OpenAI to return metadata with deadline
    vi.mock("openai", () => ({
      default: vi.fn().mockImplementation(() => ({
        chat: { completions: { create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({
            thought_type: "action_item",
            people: [],
            topics: ["benefits"],
            action_items: ["review packages"],
            deadline: "2026-03-28T00:00:00.000Z",
          })}}]
        })}}
      }))
    }));

    const { extractMetadata } = await import("@/lib/brain/metadata");
    const result = await extractMetadata("Review SBCounty benefits packages by next Friday");
    expect(result).toHaveProperty("deadline");
    expect(result.deadline).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("returns null deadline when no date mentioned", async () => {
    vi.mock("openai", () => ({
      default: vi.fn().mockImplementation(() => ({
        chat: { completions: { create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({
            thought_type: "idea",
            people: [],
            topics: ["testing"],
            action_items: [],
            deadline: null,
          })}}]
        })}}
      }))
    }));

    const { extractMetadata } = await import("@/lib/brain/metadata");
    const result = await extractMetadata("Just an idea about testing");
    expect(result.deadline).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/brain/metadata.test.ts`
Expected: FAIL — deadline not in interface

- [ ] **Step 3: Update ThoughtMetadata interface**

Add `deadline: string | null` to the interface in `lib/brain/metadata.ts`.

- [ ] **Step 4: Update extraction prompt**

Add to the system prompt's JSON schema description:
```
"deadline": "If the text mentions a specific deadline or due date (e.g., 'by Tuesday', 'this week', 'before March 25'), convert to ISO 8601 date string (e.g., '2026-03-25T00:00:00.000Z'). Always use absolute dates, never relative. If no deadline mentioned, null."
```

- [ ] **Step 5: Update insertThought in queries.ts**

When inserting, if metadata.deadline is not null, set the `deadline` column on the thought. Add `deadline` to the INSERT SQL and the metadata extraction return value.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/lib/brain/metadata.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/brain/metadata.ts lib/brain/queries.ts tests/lib/brain/metadata.test.ts
git commit -m "feat: extract deadlines from captured thoughts for urgency scoring"
```

---

## Task 7: Task Classifier (Sonnet)

**Files:**
- Create: `lib/brain/classifier.ts`
- Create: `tests/lib/brain/classifier.test.ts`

- [ ] **Step 0: Install Anthropic SDK**

Run: `npm install @anthropic-ai/sdk`
Expected: Package added to dependencies

- [ ] **Step 1: Write the test**

Test that `buildClassificationPrompt(tasks)` produces valid prompt text, and that `parseClassificationResponse(json)` correctly validates output structure — action_classification must be one of the 4 values, action_type must be from PERMISSION_TIERS allowlist, stakes must be low/medium/high.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/brain/classifier.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement classifier**

```typescript
// lib/brain/classifier.ts
import Anthropic from "@anthropic-ai/sdk";
import { ACTION_TYPE_ALLOWLIST } from "./permissions";

export interface ClassificationResult {
  thought_id: string;
  action_classification: "auto_actionable" | "draft_needed" | "human_only" | "quick_win";
  action_type: string;
  prompt_summary: string;
  stakes: "low" | "medium" | "high";
}

export async function classifyTasks(
  tasks: Array<{ id: string; raw_text: string; topics: string[]; people: string[]; action_items: string[] }>,
  anthropicApiKey: string
): Promise<ClassificationResult[]> {
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const prompt = buildClassificationPrompt(tasks);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 2000,
    system: "You are a task classifier. Output valid JSON only.",
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseClassificationResponse(text, tasks);
}
```

The prompt should:
- List the ACTION_TYPE_ALLOWLIST explicitly
- Include each task's full text, topics, people, action_items
- Request JSON array output with the ClassificationResult shape
- Emphasize: "If unsure, classify as human_only. Never invent action_types not in the list."

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/brain/classifier.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/brain/classifier.ts tests/lib/brain/classifier.test.ts
git commit -m "feat: add Sonnet-powered task classifier with allowlist validation"
```

---

## Task 8: Action Executor

**Files:**
- Create: `lib/brain/action-executor.ts`
- Modify: `lib/env.ts` — add ANTHROPIC_API_KEY
- Create: `app/api/actions/execute/route.ts`
- Create: `tests/api/actions/execute.test.ts`

- [ ] **Step 1: Add ANTHROPIC_API_KEY to env.ts**

Add to the env object in `lib/env.ts` using the required pattern (fail fast if missing):
```typescript
get ANTHROPIC_API_KEY() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is required");
  return key;
},
```

Then add the key to Vercel and pull locally:
```bash
vercel env add ANTHROPIC_API_KEY
vercel env pull .env.local --yes
```

- [ ] **Step 2: Write executor test**

Test the route:
- Rejects requests without valid QStash signature
- Refuses to execute `never`-tier actions (sets status to `blocked`)
- Executes `auto` actions and sets status to `staged`
- Records model_used, tokens, cost in result_metadata
- Handles API errors gracefully (sets status to `failed`)

Mock the Anthropic SDK, Neon, and QStash Receiver.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/api/actions/execute.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement action-executor.ts**

```typescript
// lib/brain/action-executor.ts
import Anthropic from "@anthropic-ai/sdk";
import { selectModel, ActionContext } from "./permissions";

const PROMPT_TEMPLATES: Record<string, (thought: { raw_text: string; topics: string[]; people: string[] }) => string> = {
  research: (t) => `Research the following topic thoroughly. Summarize findings relevant to the user's context.\n\nSource task:\n${t.raw_text}\n\nTopics: ${t.topics.join(", ")}\nPeople mentioned: ${t.people.join(", ")}`,
  summary: (t) => `Synthesize the following into an actionable brief.\n\n${t.raw_text}`,
  analysis: (t) => `Analyze the following. Present key findings and trade-offs.\n\n${t.raw_text}`,
  draft_email: (t) => `Draft a professional email regarding the following. Be specific and persuasive.\n\n${t.raw_text}\n\nPeople involved: ${t.people.join(", ")}`,
  draft_message: (t) => `Draft a message regarding the following.\n\n${t.raw_text}`,
  draft_content: (t) => `Draft content based on the following.\n\n${t.raw_text}`,
  draft_report: (t) => `Draft a report based on the following.\n\n${t.raw_text}`,
  recommendation: (t) => `Based on the following, provide a clear recommendation with reasoning.\n\n${t.raw_text}`,
  categorize: (t) => `Categorize and organize the following information.\n\n${t.raw_text}`,
  internal_note: (t) => `Summarize the following into a concise internal note.\n\n${t.raw_text}`,
};

export async function executeAction(
  ctx: ActionContext & { prompt_summary: string; prompt_adjustments?: string | null },
  thought: { raw_text: string; topics: string[]; people: string[] },
  anthropicApiKey: string
): Promise<{ result: string; model: string; tokens: { input: number; output: number }; cost: number }> {
  const model = selectModel(ctx);
  const client = new Anthropic({ apiKey: anthropicApiKey });

  let prompt = PROMPT_TEMPLATES[ctx.action.action_type]?.(thought) ?? `Complete the following task:\n\n${thought.raw_text}`;

  if (ctx.prompt_adjustments) {
    prompt += `\n\nAdditional guidance: ${ctx.prompt_adjustments}`;
  }

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const result = response.content[0].type === "text" ? response.content[0].text : "";
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  // Cost calculation
  const isOpus = model.includes("opus");
  const inputCostPer1M = isOpus ? 5.0 : 3.0;
  const outputCostPer1M = isOpus ? 25.0 : 15.0;
  const cost = (inputTokens / 1_000_000) * inputCostPer1M + (outputTokens / 1_000_000) * outputCostPer1M;

  return { result, model, tokens: { input: inputTokens, output: outputTokens }, cost };
}
```

- [ ] **Step 5: Implement executor route**

```typescript
// app/api/actions/execute/route.ts
// maxDuration = 120
// Verify QStash signature via @upstash/qstash Receiver
// Read action by ID from pending_actions
// Read source thought by action.thought_id
// Validate permission tier (re-derive from action_type, refuse if never)
// Call executeAction()
// Quality check (length > 100, no refusal phrases)
// Update pending_action: status=staged, result, model_used, result_metadata
// Send PWA push notification
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/api/actions/execute.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/env.ts lib/brain/action-executor.ts app/api/actions/execute/route.ts tests/api/actions/execute.test.ts
git commit -m "feat: add action executor with QStash auth and model routing"
```

---

## Task 9: Enhanced Briefing Pipeline

**Architecture note:** The existing pattern is: cron route → QStash → generate route. The heavy work runs in the **generate route**, not the cron route. We preserve this pattern. The cron route stays thin (just publishes to QStash). The generate route becomes the full pipeline orchestrator.

**Files:**
- Modify: `lib/brain/briefing.ts` — swap to Sonnet (Anthropic SDK), add new briefing sections, add `runActionPipeline()` orchestrator
- Modify: `app/api/briefing/generate/route.ts` — call full pipeline (urgency → classify → briefing → plan → dispatch)
- Modify: `lib/brain/queries.ts` — update `queryThoughts` to accept `status` as `string | string[]`

- [ ] **Step 1: Update queryThoughts to support status array**

In `lib/brain/queries.ts`, modify the `queryThoughts()` function to accept `status` as `string | string[]`. When it's an array, use `status IN (...)` instead of `status = $N`.

```typescript
// In the WHERE clause builder:
if (filters.status) {
  if (Array.isArray(filters.status)) {
    const placeholders = filters.status.map((_, i) => `$${idx + i}`).join(", ");
    conditions.push(`status IN (${placeholders})`);
    params.push(...filters.status);
    idx += filters.status.length;
  } else {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
}
```

- [ ] **Step 2: Update briefing.ts — swap model to Sonnet**

Replace OpenAI SDK call with Anthropic SDK for briefing generation. Key differences:
- No `response_format: { type: "json_object" }` — the briefing output is markdown, not JSON, so this doesn't apply. The briefing prompt already asks for markdown output.
- Use `client.messages.create({ model: "claude-sonnet-4-6-20250514", max_tokens: 1200, messages: [...] })` instead of OpenAI's chat.completions.create
- Update cost constants: Sonnet = $3.00/1M input, $15.00/1M output (was $0.15/$0.60 for gpt-4o-mini)
- Extract text from `response.content[0].text` (Anthropic format) instead of `response.choices[0].message.content`

- [ ] **Step 3: Add new briefing sections to the system prompt**

Add sections to `buildBriefingPrompt()`:
- "Actions Staged" — list of actions being executed this cycle (passed from pipeline)
- "Quick Wins" — tasks classified as quick_win
- "Forced Resolution" — tasks older than 21 days demanding a decision

- [ ] **Step 4: Add runActionPipeline() to briefing.ts**

This orchestrator function runs the full pipeline and is called from the generate route:

```typescript
export async function runActionPipeline(anthropicApiKey: string) {
  // 1. Expire stale actions
  await expireStaledActions();

  // 2. Fetch all actionable tasks (unsnoozed action_items)
  const allTasks = await queryThoughts({
    type: "action_item",
    status: ["untriaged", "active"],
  });
  const activeTasks = allTasks.filter(t => !isSnoozed(t.snoozed_until));

  // 3. Calculate urgency scores (pure code) and batch update
  for (const task of activeTasks) {
    const ageDays = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000);
    const score = calculateUrgencyScore({
      thought_type: task.thought_type,
      age_days: ageDays,
      people: task.people,
      has_blocking_edge: false, // TODO: check edges table
      referenced_in_briefing: false, // TODO: check previous briefing
      action_items: task.action_items,
      deadline: task.deadline,
    });
    await updateUrgencyScore(task.id, score);
  }

  // 4. Classify top 10 by urgency (Sonnet)
  const sorted = activeTasks.sort((a, b) => (b.urgency_score ?? 0) - (a.urgency_score ?? 0));
  const topTasks = sorted.slice(0, 10);
  const classifications = await classifyTasks(topTasks, anthropicApiKey);

  // 5. Plan actions — insert top 3 actionable into pending_actions
  const actionable = classifications.filter(c =>
    c.action_classification === "auto_actionable" || c.action_classification === "draft_needed"
  ).slice(0, 3);

  const plannedActions = [];
  for (const cls of actionable) {
    // Dedup check — skip if thought already has active action
    const existing = await queryActionByThoughtId(cls.thought_id, true);
    if (existing) continue;

    const tier = getPermissionTier(cls.action_type);
    const action = await insertPendingAction({
      thought_id: cls.thought_id,
      action_type: cls.action_type,
      permission_tier: tier,
      prompt_summary: cls.prompt_summary,
      stakes: cls.stakes,
      urgency_score: sorted.find(t => t.id === cls.thought_id)?.urgency_score ?? 0,
    });
    plannedActions.push(action);
  }

  // 6. Generate briefing (Sonnet) — enriched with classifications
  const briefingData = await gatherBriefingData();
  const briefing = await generateBriefing({
    ...briefingData,
    classifications,
    plannedActions,
    forcedResolution: activeTasks.filter(t => isForceResolution(ageDaysFor(t))),
  });

  // 7. Link actions to briefing
  for (const action of plannedActions) {
    await updateActionBriefingId(action.id, briefing.id);
  }

  // 8. Dispatch action execution via QStash (parallel, 5 min delay)
  return { briefing, plannedActions };
}
```

- [ ] **Step 5: Update generate route to call full pipeline + dispatch QStash**

In `app/api/briefing/generate/route.ts`:

```typescript
// Existing auth checks (x-briefing-secret or QStash signature) stay the same
const { briefing, plannedActions } = await runActionPipeline(env.ANTHROPIC_API_KEY);

// Dispatch action execution via QStash (or fallback for local dev)
if (env.QSTASH_TOKEN) {
  const qstash = new Client({ token: env.QSTASH_TOKEN });
  for (const action of plannedActions) {
    await qstash.publishJSON({
      url: `${baseUrl}/api/actions/execute?id=${action.id}`,
      retries: 3,
      delay: "5m",
      headers: { "x-briefing-secret": env.BRAIN_API_KEY },
    });
  }
} else {
  // Local dev fallback: execute directly
  for (const action of plannedActions) {
    await fetch(`${baseUrl}/api/actions/execute?id=${action.id}`, {
      method: "POST",
      headers: { "x-briefing-secret": env.BRAIN_API_KEY },
    });
  }
}

return NextResponse.json({
  id: briefing.id,
  thoughtCount: briefing.thoughtCount,
  actionsPlanned: plannedActions.length,
  tokens: briefing.tokens,
  cost: briefing.cost,
});
```

- [ ] **Step 6: Test the full pipeline locally**

Run: `curl -X POST -H "x-briefing-secret: $BRAIN_API_KEY" http://localhost:3000/api/briefing/generate`
Expected: Briefing generated with Sonnet, tasks classified, pending_actions created, actions executed via fallback

- [ ] **Step 7: Commit**

```bash
git add lib/brain/briefing.ts lib/brain/queries.ts app/api/briefing/generate/route.ts
git commit -m "feat: upgrade briefing pipeline to Sonnet with urgency scoring, classification, and action dispatch"
```

---

## Task 10: PWA Push Notifications

**Files:**
- Create: `lib/notifications/push.ts`
- Create: `app/api/notifications/subscribe/route.ts`
- Modify: `lib/env.ts` — add VAPID keys

- [ ] **Step 1: Generate VAPID keys**

Run: `npx web-push generate-vapid-keys`
Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to `.env.local` and Vercel env vars.

- [ ] **Step 2: Add VAPID keys to env.ts**

```typescript
get VAPID_PUBLIC_KEY() { return process.env.VAPID_PUBLIC_KEY || ""; },
get VAPID_PRIVATE_KEY() { return process.env.VAPID_PRIVATE_KEY || ""; },
```

- [ ] **Step 3: Install web-push dependency**

Run: `npm install web-push`

- [ ] **Step 4: Implement push.ts**

```typescript
// lib/notifications/push.ts
import webpush from "web-push";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";

export async function sendPushNotification(
  userEmail: string,
  payload: { title: string; body: string; url?: string }
) {
  webpush.setVapidDetails("mailto:" + userEmail, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const sql = neon(env.DATABASE_URL);
  const subs = await sql`SELECT subscription FROM push_subscriptions WHERE user_email = ${userEmail} AND active = true`;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
    } catch (e: unknown) {
      if (e && typeof e === "object" && "statusCode" in e && (e as { statusCode: number }).statusCode === 410) {
        await sql`UPDATE push_subscriptions SET active = false WHERE subscription = ${JSON.stringify(sub.subscription)}`;
      }
    }
  }
}

export async function saveSubscription(userEmail: string, subscription: PushSubscription) { /* insert */ }
export async function removeSubscription(userEmail: string) { /* delete */ }
```

- [ ] **Step 5: Implement subscribe route**

```typescript
// app/api/notifications/subscribe/route.ts
// POST: save subscription
// DELETE: remove subscription
// Both require dashboard auth
```

- [ ] **Step 6: Add service worker registration to dashboard layout**

Add a `useEffect` in the dashboard layout that registers a service worker and subscribes to push notifications using the VAPID public key. The service worker file goes in `public/sw.js`.

- [ ] **Step 7: Commit**

```bash
git add lib/notifications/push.ts app/api/notifications/subscribe/route.ts lib/env.ts public/sw.js
git commit -m "feat: add PWA push notification system with VAPID auth"
```

---

## Task 11: Action API Routes (Approve/Reject/Flag/Retry)

**Files:**
- Create: `app/api/brain/actions/route.ts` — list actions
- Create: `app/api/brain/actions/[id]/route.ts` — approve/reject/flag/dismiss
- Create: `app/api/brain/actions/[id]/retry/route.ts` — retry with optional note

- [ ] **Step 1: Implement list route**

```typescript
// GET /api/brain/actions?status=staged&limit=20
// Requires dashboard auth
// Delegates to queryActionsByStatus()
```

- [ ] **Step 2: Implement action mutation route**

```typescript
// app/api/brain/actions/[id]/route.ts
// PATCH /api/brain/actions/[id]
// Body: { action: "approve" | "reject" | "flag" | "dismiss", reason?: string }
// - approve: status = approved, reviewed_at = now
// - reject: status = rejected, reviewed_at = now, stores reason
// - flag: flagged = true, flag_reason = reason
// - dismiss: status = dismissed
// Requires dashboard auth
```

- [ ] **Step 2b: Implement retry route (separate file — Next.js App Router requires separate directory)**

```typescript
// app/api/brain/actions/[id]/retry/route.ts
// POST /api/brain/actions/[id]/retry
// Body: { note?: string }
// Creates new pending_action linked via parent_action_id
// Copies original prompt_summary + appends note as prompt_adjustments
// Dispatches via QStash
// Requires dashboard auth
```

- [ ] **Step 3: Add MCP tools for action management**

Add to `lib/brain/tools.ts`:
- `listPendingActions(status?)` — calls queryActionsByStatus
- `approveAction(id)` — calls updateActionStatus
- `rejectAction(id, reason?)` — calls updateActionStatus

Register all three in `app/api/mcp/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/api/brain/actions/ lib/brain/tools.ts app/api/mcp/route.ts
git commit -m "feat: add action approval/reject/flag API routes and MCP tools"
```

---

## Task 12: Approval Queue Dashboard

**Files:**
- Create: `app/dashboard/queue/page.tsx`
- Create: `components/dashboard/action-card.tsx`
- Create: `components/dashboard/queue-sections.tsx`
- Modify: `app/dashboard/layout.tsx` — add Queue nav link
- Modify: `components/dashboard/nav-bar.tsx` — add Queue link
- Modify: `components/dashboard/mobile-nav.tsx` — add Queue link

- [ ] **Step 1: Create action-card component**

Displays a single pending action with:
- Action type badge (color-coded: green auto, yellow staged, red never)
- Model badge (Sonnet/Opus)
- Urgency bar visualization
- Prompt summary
- Result preview (expandable)
- Buttons based on status: Approve/Reject/Retry with note (staged), View/Flag (auto), Snooze/Complete/Skip (blocked)

Follow existing component patterns — `@base-ui/react` with `render` prop, Tailwind classes.

- [ ] **Step 2: Create queue-sections component**

Three sections:
- "Needs Review" — staged actions, sorted by urgency
- "Auto-Completed" — auto-tier completed actions from last 48h
- "Blocked" — never/human_only items with snooze buttons

Each section has a header with count badge.

- [ ] **Step 3: Create queue page**

```typescript
// app/dashboard/queue/page.tsx
// "use client"
// Fetch: /api/brain/actions?status=staged, /api/brain/actions?status=approved (last 48h), blocked thoughts
// Handle: approve, reject, flag, snooze, retry with note
// Optimistic UI removal on approve/reject (same pattern as tasks page)
```

- [ ] **Step 4: Add Queue to navigation**

Add to `nav-bar.tsx` and `mobile-nav.tsx` nav links array:
```typescript
{ href: "/dashboard/queue", label: "Queue", icon: InboxIcon }
```

- [ ] **Step 5: Test manually**

Navigate to `/dashboard/queue`. Verify:
- Empty state renders cleanly
- After running briefing pipeline, actions appear in correct sections
- Approve/reject/flag buttons work
- Snooze buttons on blocked items work

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/queue/ components/dashboard/action-card.tsx components/dashboard/queue-sections.tsx app/dashboard/layout.tsx components/dashboard/nav-bar.tsx components/dashboard/mobile-nav.tsx
git commit -m "feat: add approval queue dashboard with action cards and sections"
```

---

## Task 13: Integration Testing & End-to-End Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass + all new tests pass

- [ ] **Step 2: Test the full pipeline end-to-end locally**

1. Start dev server: `npm run dev`
2. Capture a test thought: use dashboard or MCP to capture "Research what Julian Rubisch is building and how to position similarly"
3. Trigger briefing: `curl -H "x-vercel-cron-secret: $CRON_SECRET" http://localhost:3000/api/briefing/cron`
4. Verify: briefing generated with Sonnet, task classified, pending_action created
5. Check QStash dispatch (or fallback execution)
6. Verify: action result in pending_actions with status "staged"
7. Open `/dashboard/queue` — verify action card appears
8. Approve the action — verify status changes

- [ ] **Step 3: Test edge cases**

- Capture a thought with no actionable content → classified as human_only → no action created
- Snooze a task → verify it disappears from briefing and queue
- Snooze 3 times → verify 4th snooze is rejected
- Trigger briefing twice quickly → verify no duplicate actions (unique index)

- [ ] **Step 4: Commit any fixes (add specific changed files, not -A)**

```bash
git add <specific files changed during integration testing>
git commit -m "fix: integration test fixes for action queue pipeline"
```

---

## Task 14: Deploy

- [ ] **Step 1: Add environment variables to Vercel**

Via `vercel env add`:
- `ANTHROPIC_API_KEY` (production + preview)
- `VAPID_PUBLIC_KEY` (production + preview)
- `VAPID_PRIVATE_KEY` (production + preview)

- [ ] **Step 2: Create deploy branch and push**

```bash
git checkout -b feat/action-queue
git push -u origin feat/action-queue
```

- [ ] **Step 3: Verify preview deployment**

- Migration runs successfully (check build logs for "Applied migration: 010_action_queue.sql")
- Dashboard loads, queue page accessible
- Push notification subscription works

- [ ] **Step 4: Merge to main when verified**

```bash
git checkout main
git merge feat/action-queue
git push origin main
```

- [ ] **Step 5: Verify production**

- Briefing cron fires at 6 AM UTC
- Actions are classified and executed
- Push notifications arrive
- Approval queue renders results

---

## Deferred to Phase 1.1 (spec items not covered in this plan)

These spec features are fully designed but deferred to keep this plan focused on the core pipeline:

- **Flag-based auto-demotion (spec §6.5):** The 20%/40% flag rate thresholds and auto-demotion logic. `getActionTypeHealth()` query is built (Task 4), but no code consumes it to trigger warnings or auto-demotions. Add as a step in the briefing pipeline once the system has enough flag data to be meaningful.
- **Dashboard Settings section (spec §10.4):** Action type health visualization and permission overrides management UI. The data layer supports it (Task 4 queries + permission_overrides table), but the dashboard page is deferred.
- **Blocking edge detection in urgency scoring:** The `has_blocking_edge` boost is in the formula but the urgency scoring code currently hardcodes `false`. Wiring this up requires querying the edges table per-thought during scoring. Deferred to avoid N+1 queries in the scoring loop — batch query approach needed.
