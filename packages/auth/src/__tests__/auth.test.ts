import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

// Clear env before tests so we control the auth mode
const originalEnv = { ...process.env };

// Mock Supabase
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

import { verifyToken, extractToken, AuthError } from "../index.js";
import { createClient } from "@supabase/supabase-js";

const TEST_SECRET = "test-secret-key-that-is-at-least-32-chars";

async function createTestJWT(
  claims: Record<string, unknown>,
  secret = TEST_SECRET,
) {
  const encoder = new TextEncoder();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encoder.encode(secret));
}

async function createExpiredJWT(claims: Record<string, unknown>) {
  const encoder = new TextEncoder();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2 hours ago
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired 1 hour ago
    .sign(encoder.encode(TEST_SECRET));
}

describe("verifyToken", () => {
  beforeEach(() => {
    // Reset env to only JWT secret mode
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.JWT_SECRET;
    vi.clearAllMocks();
  });

  it("returns claims for a valid token (JWT secret mode)", async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const token = await createTestJWT({
      sub: "user-123",
      email: "test@example.com",
      org_id: "org-456",
      role: "rep",
    });

    const claims = await verifyToken(token);
    expect(claims.userId).toBe("user-123");
    expect(claims.email).toBe("test@example.com");
    expect(claims.orgId).toBe("org-456");
    expect(claims.role).toBe("rep");
  });

  it("throws AuthError for expired token", async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const token = await createExpiredJWT({ sub: "user-123" });

    await expect(verifyToken(token)).rejects.toThrow(AuthError);
    await expect(verifyToken(token)).rejects.toMatchObject({
      code: "expired",
    });
  });

  it("throws AuthError for malformed token", async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    await expect(verifyToken("not-a-jwt")).rejects.toThrow(AuthError);
    await expect(verifyToken("not-a-jwt")).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("throws AuthError for empty token", async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    await expect(verifyToken("")).rejects.toThrow(AuthError);
    await expect(verifyToken("")).rejects.toMatchObject({
      code: "malformed",
    });
  });

  it("throws AuthError when token is missing sub claim", async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const token = await createTestJWT({ email: "test@example.com" });

    await expect(verifyToken(token)).rejects.toThrow(AuthError);
    await expect(verifyToken(token)).rejects.toMatchObject({
      code: "missing_claims",
    });
  });

  it("throws AuthError when no auth config is set", async () => {
    const token = await createTestJWT({ sub: "user-123" });

    await expect(verifyToken(token)).rejects.toThrow(AuthError);
    await expect(verifyToken(token)).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("returns claims via Supabase client mode", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

    const mockGetUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "user-789",
          email: "admin@example.com",
          user_metadata: { org_id: "org-111", role: "admin" },
        },
      },
      error: null,
    });

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: mockGetUser },
    });

    const claims = await verifyToken("some-token");
    expect(claims.userId).toBe("user-789");
    expect(claims.email).toBe("admin@example.com");
    expect(claims.orgId).toBe("org-111");
    expect(claims.role).toBe("admin");
  });
});

describe("extractToken", () => {
  it("extracts token from Authorization header", () => {
    const token = extractToken({
      headers: { authorization: "Bearer my-jwt-token" },
    });
    expect(token).toBe("my-jwt-token");
  });

  it("extracts token from query parameter", () => {
    const token = extractToken({
      url: "http://localhost:3000/ws?token=my-jwt-token",
    });
    expect(token).toBe("my-jwt-token");
  });

  it("prefers Authorization header over query parameter", () => {
    const token = extractToken({
      headers: { authorization: "Bearer header-token" },
      url: "http://localhost:3000/ws?token=query-token",
    });
    expect(token).toBe("header-token");
  });

  it("returns null when no token is present", () => {
    const token = extractToken({ headers: {} });
    expect(token).toBeNull();
  });

  it("returns null for non-Bearer authorization", () => {
    const token = extractToken({
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(token).toBeNull();
  });

  it("handles relative URLs with query parameter", () => {
    const token = extractToken({
      url: "/ws?token=my-jwt-token&session_id=abc",
    });
    expect(token).toBe("my-jwt-token");
  });
});
