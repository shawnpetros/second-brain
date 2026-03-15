import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/dashboard-auth", () => ({
  requireDashboardAuth: vi.fn().mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" }),
}));

vi.mock("@/lib/brain/queries", () => ({
  querySemanticSearch: vi.fn(),
}));

import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { querySemanticSearch } from "@/lib/brain/queries";

const mockResults = [
  {
    id: "1",
    raw_text: "Semantic match",
    thought_type: "insight",
    status: "active",
    people: [],
    topics: [],
    action_items: [],
    source: "mcp",
    created_at: "2026-03-15T00:00:00Z",
    updated_at: "2026-03-15T00:00:00Z",
    similarity: 0.92,
  },
];

describe("GET /api/brain/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDashboardAuth).mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" });
  });

  it("returns semantic search results", async () => {
    vi.mocked(querySemanticSearch).mockResolvedValue(mockResults);

    const { GET } = await import("@/app/api/brain/search/route");
    const req = new NextRequest("http://localhost/api/brain/search?q=testing");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].similarity).toBe(0.92);
    expect(querySemanticSearch).toHaveBeenCalledWith("testing", 10);
  });

  it("returns 400 when q param is missing", async () => {
    const { GET } = await import("@/app/api/brain/search/route");
    const req = new NextRequest("http://localhost/api/brain/search");
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("passes custom limit", async () => {
    vi.mocked(querySemanticSearch).mockResolvedValue([]);

    const { GET } = await import("@/app/api/brain/search/route");
    const req = new NextRequest("http://localhost/api/brain/search?q=test&limit=5");
    await GET(req);

    expect(querySemanticSearch).toHaveBeenCalledWith("test", 5);
  });

  it("returns 401 when auth fails", async () => {
    vi.mocked(requireDashboardAuth).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const { GET } = await import("@/app/api/brain/search/route");
    const req = new NextRequest("http://localhost/api/brain/search?q=test");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
