import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk server functions
const mockAuth = vi.fn();
const mockCurrentUser = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

import { requireDashboardAuth } from "@/lib/auth/dashboard-auth";

describe("requireDashboardAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    try {
      await requireDashboardAuth();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(401);
      const body = await (e as Response).json();
      expect(body.error).toBe("Unauthorized");
    }
  });

  it("throws 403 when email not in allowlist", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "hacker@evil.com" }],
    });

    try {
      await requireDashboardAuth();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
      const body = await (e as Response).json();
      expect(body.error).toBe("Forbidden");
    }
  });

  it("throws 403 when user has no email", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockCurrentUser.mockResolvedValue({ emailAddresses: [] });

    try {
      await requireDashboardAuth();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  it("returns userId and email for allowed user", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "shawn.petros@gmail.com" }],
    });

    const result = await requireDashboardAuth();

    expect(result.userId).toBe("user_123");
    expect(result.email).toBe("shawn.petros@gmail.com");
  });

  it("handles case-insensitive email matching", async () => {
    mockAuth.mockResolvedValue({ userId: "user_456" });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "Cindy.Petros@Gmail.Com" }],
    });

    const result = await requireDashboardAuth();

    expect(result.userId).toBe("user_456");
    expect(result.email).toBe("Cindy.Petros@Gmail.Com");
  });
});
