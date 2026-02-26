import { describe, it, expect } from "vitest";
import { z } from "zod";
import { sendForbidden, sendUnauthorized, sendValidationError } from "./http-errors.js";

function createMockReply() {
  let statusCode = 200;
  let payload: unknown = null;

  const reply = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(body: unknown) {
      payload = body;
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    },
  };

  return reply;
}

describe("http-errors", () => {
  it("sendValidationError returns 400 with normalized payload", () => {
    const schema = z.object({ id: z.string().uuid() });
    const result = schema.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const reply = createMockReply();
    sendValidationError(reply as any, result.error);

    expect(reply.statusCode).toBe(400);
    expect((reply.payload as any).code).toBe("VALIDATION_ERROR");
    expect(Array.isArray((reply.payload as any).fieldErrors)).toBe(true);
  });

  it("sendUnauthorized returns 401", () => {
    const reply = createMockReply();
    sendUnauthorized(reply as any);
    expect(reply.statusCode).toBe(401);
  });

  it("sendForbidden returns 403", () => {
    const reply = createMockReply();
    sendForbidden(reply as any);
    expect(reply.statusCode).toBe(403);
  });
});
