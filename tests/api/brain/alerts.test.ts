import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/dashboard-auth", () => ({
  requireDashboardAuth: vi.fn().mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" }),
}));

vi.mock("@/lib/brain/queries", () => ({
  queryAlerts: vi.fn(),
}));

import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryAlerts } from "@/lib/brain/queries";

describe("GET /api/brain/alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDashboardAuth).mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" });
  });

  it("returns alerts", async () => {
    const mockAlerts = [
      {
        type: "aging_untriaged" as const,
        title: "Untriaged task aging",
        description: "Old task",
        thought_id: "1",
        age_days: 5,
      },
      {
        type: "relationship_decay" as const,
        title: "Relationship fading",
        description: "Haven't mentioned Bob in 45 days",
        person: "Bob",
        age_days: 45,
      },
    ];
    vi.mocked(queryAlerts).mockResolvedValue(mockAlerts);

    const { GET } = await import("@/app/api/brain/alerts/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].type).toBe("aging_untriaged");
    expect(data[1].type).toBe("relationship_decay");
  });

  it("returns empty array when no alerts", async () => {
    vi.mocked(queryAlerts).mockResolvedValue([]);

    const { GET } = await import("@/app/api/brain/alerts/route");
    const res = await GET();
    const data = await res.json();

    expect(data).toEqual([]);
  });

  it("returns 401 when auth fails", async () => {
    vi.mocked(requireDashboardAuth).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const { GET } = await import("@/app/api/brain/alerts/route");
    const res = await GET();

    expect(res.status).toBe(401);
  });
});
