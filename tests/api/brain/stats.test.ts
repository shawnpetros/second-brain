import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/dashboard-auth", () => ({
  requireDashboardAuth: vi.fn().mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" }),
}));

vi.mock("@/lib/brain/queries", () => ({
  queryStats: vi.fn(),
}));

import { queryStats } from "@/lib/brain/queries";

const mockStats = {
  total: 100,
  recent: 25,
  dailyAvg: 3.5,
  byType: [{ thought_type: "insight", count: 10 }],
  topTopics: [{ topic: "testing", count: 5 }],
  topPeople: [{ person: "Alice", count: 3 }],
  openTasks: 8,
};

describe("GET /api/brain/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns brain stats with default days", async () => {
    vi.mocked(queryStats).mockResolvedValue(mockStats);

    const { GET } = await import("@/app/api/brain/stats/route");
    const req = new NextRequest("http://localhost/api/brain/stats");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(100);
    expect(data.openTasks).toBe(8);
    expect(queryStats).toHaveBeenCalledWith(30);
  });

  it("passes custom days parameter", async () => {
    vi.mocked(queryStats).mockResolvedValue(mockStats);

    const { GET } = await import("@/app/api/brain/stats/route");
    const req = new NextRequest("http://localhost/api/brain/stats?days=7");
    await GET(req);

    expect(queryStats).toHaveBeenCalledWith(7);
  });
});
