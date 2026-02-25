#!/usr/bin/env node

import crypto from "node:crypto";

const required = [
  "STAGING_API_URL",
  "STRIPE_WEBHOOK_SECRET",
  "STAGING_STRIPE_CUSTOMER_ID",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const apiBase = process.env.STAGING_API_URL;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const customerId = process.env.STAGING_STRIPE_CUSTOMER_ID;

function buildSignature(payload, timestamp) {
  const signedPayload = `${timestamp}.${payload}`;
  const digest = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

async function sendStripeEvent(type, object) {
  const payload = JSON.stringify({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    api_version: "2026-01-28.clover",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignature(payload, timestamp);

  const response = await fetch(`${apiBase}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });

  const text = await response.text();
  return {
    ok: response.status === 200,
    status: response.status,
    body: text,
    type,
  };
}

const paymentFailed = await sendStripeEvent("invoice.payment_failed", {
  id: `in_${Date.now()}`,
  object: "invoice",
  customer: customerId,
});

const paymentSucceeded = await sendStripeEvent("invoice.payment_succeeded", {
  id: `in_${Date.now()}_s`,
  object: "invoice",
  customer: customerId,
});

const results = [paymentFailed, paymentSucceeded];
console.log(JSON.stringify({ results }, null, 2));

if (results.some((result) => !result.ok)) {
  process.exit(1);
}
