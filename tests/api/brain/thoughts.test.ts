import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock auth
vi.mock("@/lib/auth/dashboard-auth", () => ({
  requireDashboardAuth: vi.fn().mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" }),
}));

// Mock queries
vi.mock("@/lib/brain/queries", () => ({
  queryThoughts: vi.fn(),
  insertThought: vi.fn(),
  queryThoughtById: vi.fn(),
  updateThought: vi.fn(),
  removeThought: vi.fn(),
}));

import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";
import { queryThoughts, insertThought, queryThoughtById, updateThought, removeThought } from "@/lib/brain/queries";

const mockThought = {
  id: "abc-123",
  raw_text: "Test thought",
  thought_type: "insight",
  status: "active",
  people: [],
  topics: ["test"],
  action_items: [],
  source: "dashboard",
  created_at: "2026-03-15T00:00:00Z",
  updated_at: "2026-03-15T00:00:00Z",
};

describe("GET /api/brain/thoughts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDashboardAuth).mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" });
  });

  it("returns thoughts with default params", async () => {
    vi.mocked(queryThoughts).mockResolvedValue([mockThought]);

    const { GET } = await import("@/app/api/brain/thoughts/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].raw_text).toBe("Test thought");
  });

  it("passes filter params to query", async () => {
    vi.mocked(queryThoughts).mockResolvedValue([]);

    const { GET } = await import("@/app/api/brain/thoughts/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts?type=insight&topic=test&limit=5");
    await GET(req);

    expect(queryThoughts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "insight",
        topic: "test",
        limit: 5,
      })
    );
  });

  it("returns 401 when auth fails", async () => {
    vi.mocked(requireDashboardAuth).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const { GET } = await import("@/app/api/brain/thoughts/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});

describe("POST /api/brain/thoughts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDashboardAuth).mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" });
  });

  it("creates a new thought", async () => {
    vi.mocked(insertThought).mockResolvedValue(mockThought);

    const { POST } = await import("@/app/api/brain/thoughts/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts", {
      method: "POST",
      body: JSON.stringify({ text: "Test thought" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.raw_text).toBe("Test thought");
    expect(insertThought).toHaveBeenCalledWith("Test thought", "dashboard");
  });

  it("returns 400 when text is missing", async () => {
    const { POST } = await import("@/app/api/brain/thoughts/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("passes custom source", async () => {
    vi.mocked(insertThought).mockResolvedValue(mockThought);

    const { POST } = await import("@/app/api/brain/thoughts/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts", {
      method: "POST",
      body: JSON.stringify({ text: "Test", source: "mobile" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req);

    expect(insertThought).toHaveBeenCalledWith("Test", "mobile");
  });
});

describe("GET /api/brain/thoughts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDashboardAuth).mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" });
  });

  it("returns a single thought", async () => {
    vi.mocked(queryThoughtById).mockResolvedValue(mockThought);

    const { GET } = await import("@/app/api/brain/thoughts/[id]/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts/abc-123");
    const res = await GET(req, { params: Promise.resolve({ id: "abc-123" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.id).toBe("abc-123");
  });

  it("returns 404 when thought not found", async () => {
    vi.mocked(queryThoughtById).mockResolvedValue(null);

    const { GET } = await import("@/app/api/brain/thoughts/[id]/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts/nonexistent");
    const res = await GET(req, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/brain/thoughts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDashboardAuth).mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" });
  });

  it("updates thought text", async () => {
    vi.mocked(updateThought).mockResolvedValue({ ...mockThought, raw_text: "Updated text" });

    const { PATCH } = await import("@/app/api/brain/thoughts/[id]/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts/abc-123", {
      method: "PATCH",
      body: JSON.stringify({ raw_text: "Updated text" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc-123" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.raw_text).toBe("Updated text");
    expect(updateThought).toHaveBeenCalledWith("abc-123", { raw_text: "Updated text" });
  });

  it("updates thought status", async () => {
    vi.mocked(updateThought).mockResolvedValue({ ...mockThought, status: "completed" });

    const { PATCH } = await import("@/app/api/brain/thoughts/[id]/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts/abc-123", {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc-123" }) });

    expect(res.status).toBe(200);
    expect(updateThought).toHaveBeenCalledWith("abc-123", { status: "completed" });
  });

  it("returns 400 when no valid updates", async () => {
    const { PATCH } = await import("@/app/api/brain/thoughts/[id]/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts/abc-123", {
      method: "PATCH",
      body: JSON.stringify({ invalid: "field" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc-123" }) });

    expect(res.status).toBe(400);
  });

  it("returns 404 when thought not found", async () => {
    vi.mocked(updateThought).mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/brain/thoughts/[id]/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts/abc-123", {
      method: "PATCH",
      body: JSON.stringify({ raw_text: "Updated" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc-123" }) });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/brain/thoughts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDashboardAuth).mockResolvedValue({ userId: "user_123", email: "shawn.petros@gmail.com" });
  });

  it("deletes a thought", async () => {
    vi.mocked(removeThought).mockResolvedValue(true);

    const { DELETE } = await import("@/app/api/brain/thoughts/[id]/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts/abc-123", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "abc-123" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 404 when thought not found", async () => {
    vi.mocked(removeThought).mockResolvedValue(false);

    const { DELETE } = await import("@/app/api/brain/thoughts/[id]/route");
    const req = new NextRequest("http://localhost/api/brain/thoughts/nonexistent", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
  });
});
