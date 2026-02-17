import type { FastifyReply, FastifyRequest } from "fastify";
import { createServiceClient } from "./supabase.js";
import { sendForbidden, sendUnauthorized } from "./http-errors.js";

export type AuthContext = {
  userId: string;
  email: string | null;
};

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendUnauthorized(reply, "Missing bearer token");
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    sendUnauthorized(reply, "Missing bearer token");
    return null;
  }

  const supabase = createServiceClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    sendUnauthorized(reply, "Invalid or expired token");
    return null;
  }

  return { userId: user.id, email: user.email ?? null };
}

export async function requireOrgMembership(
  reply: FastifyReply,
  orgId: string,
  userId: string,
  allowedRoles?: string[],
): Promise<{ role: string } | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("organization_users")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    sendForbidden(reply, "Organization access denied");
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(data.role)) {
    sendForbidden(reply, "Insufficient organization role");
    return null;
  }

  return { role: data.role };
}
