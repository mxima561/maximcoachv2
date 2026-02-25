import test from "node:test";
import assert from "node:assert/strict";
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

test("sendValidationError returns 400 with normalized payload", () => {
  const schema = z.object({ id: z.string().uuid() });
  const result = schema.safeParse({ id: "not-a-uuid" });
  assert.equal(result.success, false);
  if (result.success) return;

  const reply = createMockReply();
  sendValidationError(reply as any, result.error);

  assert.equal(reply.statusCode, 400);
  assert.equal((reply.payload as any).code, "VALIDATION_ERROR");
  assert.equal(Array.isArray((reply.payload as any).fieldErrors), true);
});

test("sendUnauthorized returns 401", () => {
  const reply = createMockReply();
  sendUnauthorized(reply as any);
  assert.equal(reply.statusCode, 401);
});

test("sendForbidden returns 403", () => {
  const reply = createMockReply();
  sendForbidden(reply as any);
  assert.equal(reply.statusCode, 403);
});
