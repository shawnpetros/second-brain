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

const DEADLINE_BOOST_WINDOW_MS = 48 * 60 * 60 * 1000;

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

  if (input.deadline) {
    const deadlineMs = new Date(input.deadline).getTime();
    const nowMs = Date.now();
    if (deadlineMs - nowMs < DEADLINE_BOOST_WINDOW_MS && deadlineMs > nowMs) {
      boosts += 3;
    }
  }

  if (input.people.length > 0) boosts += 2;
  if (input.has_blocking_edge) boosts += 2;
  if (input.referenced_in_briefing) boosts += 1;
  if (input.action_items.length > 0) boosts += 1;

  return base * ageMult + boosts;
}
