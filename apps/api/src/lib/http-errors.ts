import type { FastifyReply } from "fastify";
import { z } from "zod";

type FieldError = {
  path: string;
  message: string;
  code: string;
};

type ApiErrorResponse = {
  code: string;
  message: string;
  fieldErrors?: FieldError[];
};

function normalizePath(path: Array<string | number | symbol>): string {
  if (path.length === 0) return "root";
  return path
    .map((segment) => {
      if (typeof segment === "number") return `[${segment}]`;
      if (typeof segment === "symbol") return String(segment);
      return segment;
    })
    .join(".");
}

export function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  const fieldErrors: FieldError[] = error.issues.map((issue) => ({
    path: normalizePath(issue.path),
    message: issue.message,
    code: issue.code,
  }));

  return reply.status(400).send({
    code: "VALIDATION_ERROR",
    message: "Invalid request payload",
    fieldErrors,
  } satisfies ApiErrorResponse);
}

export function sendUnauthorized(
  reply: FastifyReply,
  message = "Authentication required",
) {
  return reply.status(401).send({
    code: "UNAUTHORIZED",
    message,
  } satisfies ApiErrorResponse);
}

export function sendForbidden(
  reply: FastifyReply,
  message = "You do not have access to this resource",
) {
  return reply.status(403).send({
    code: "FORBIDDEN",
    message,
  } satisfies ApiErrorResponse);
}
