import { createClient } from "@supabase/supabase-js";
import { jwtVerify, createRemoteJWKSet } from "jose";

export class AuthError extends Error {
  readonly code: "expired" | "malformed" | "missing_claims" | "invalid";

  constructor(
    message: string,
    code: "expired" | "malformed" | "missing_claims" | "invalid",
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export interface AuthClaims {
  userId: string;
  email: string | null;
  orgId: string | null;
  role: string | null;
}

/**
 * Verify a Supabase JWT and extract user claims.
 *
 * Supports two modes:
 * 1. Supabase client verification (SUPABASE_URL + SERVICE_ROLE_KEY) — most secure
 * 2. Direct JWT verification (JWT_SECRET or JWKS) — for services without Supabase client deps
 */
export async function verifyToken(token: string): Promise<AuthClaims> {
  if (!token) {
    throw new AuthError("Token is required", "malformed");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const jwtSecret =
    process.env.SUPABASE_JWT_SECRET ?? process.env.JWT_SECRET;

  // Mode 1: Use Supabase client to verify token (gets full user object)
  if (supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      if (error.message.includes("expired")) {
        throw new AuthError("Token has expired", "expired");
      }
      throw new AuthError(
        error.message || "Invalid token",
        "invalid",
      );
    }

    if (!user) {
      throw new AuthError("No user found for token", "invalid");
    }

    return {
      userId: user.id,
      email: user.email ?? null,
      orgId: (user.user_metadata?.org_id as string) ?? null,
      role: (user.user_metadata?.role as string) ?? null,
    };
  }

  // Mode 2: Direct JWT verification
  if (jwtSecret) {
    try {
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);

      if (!payload.sub) {
        throw new AuthError("Token missing sub claim", "missing_claims");
      }

      return {
        userId: payload.sub,
        email: (payload.email as string) ?? null,
        orgId: (payload.org_id as string) ?? null,
        role: (payload.role as string) ?? null,
      };
    } catch (err) {
      if (err instanceof AuthError) throw err;
      const message = err instanceof Error ? err.message : "JWT verification failed";
      if (message.includes("expired") || message.includes("exp") || message.includes("timestamp check")) {
        throw new AuthError("Token has expired", "expired");
      }
      throw new AuthError(message, "invalid");
    }
  }

  // Mode 3: JWKS (remote key set)
  if (supabaseUrl) {
    try {
      const jwks = createRemoteJWKSet(
        new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
      );
      const { payload } = await jwtVerify(token, jwks);

      if (!payload.sub) {
        throw new AuthError("Token missing sub claim", "missing_claims");
      }

      return {
        userId: payload.sub,
        email: (payload.email as string) ?? null,
        orgId: (payload.org_id as string) ?? null,
        role: (payload.role as string) ?? null,
      };
    } catch (err) {
      if (err instanceof AuthError) throw err;
      const message = err instanceof Error ? err.message : "JWT verification failed";
      throw new AuthError(message, "invalid");
    }
  }

  throw new AuthError(
    "No auth configuration found. Set SUPABASE_URL + SERVICE_ROLE_KEY, or JWT_SECRET.",
    "invalid",
  );
}

/**
 * Extract a JWT token from common request patterns.
 * Checks Authorization header first, then ?token= query param.
 */
export function extractToken(request: {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
}): string | null {
  // Check Authorization header
  const auth = request.headers?.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  // Check query parameter
  if (request.url) {
    try {
      const url = new URL(request.url, "http://localhost");
      const token = url.searchParams.get("token");
      if (token) return token;
    } catch {
      // Invalid URL, skip
    }
  }

  return null;
}
