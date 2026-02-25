#!/usr/bin/env node

const required = ["STAGING_API_URL", "STAGING_AUTH_TOKEN"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const apiUrl = process.env.STAGING_API_URL;
const authToken = process.env.STAGING_AUTH_TOKEN;

async function runRequest(name, input, expectedStatus) {
  const res = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(input.auth === false
        ? {}
        : { authorization: `Bearer ${authToken}` }),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const bodyText = await res.text();
  const ok = res.status === expectedStatus;
  return { name, ok, status: res.status, expectedStatus, bodyText };
}

const checks = [
  {
    name: "check_trial_requires_auth",
    input: {
      url: `${apiUrl}/api/sessions/check-trial`,
      method: "POST",
      auth: false,
      body: {},
    },
    expectedStatus: 401,
  },
  {
    name: "check_trial_invalid_payload",
    input: {
      url: `${apiUrl}/api/sessions/check-trial`,
      method: "POST",
      body: { user_id: 12345 },
    },
    expectedStatus: 400,
  },
  {
    name: "session_create_requires_org_id",
    input: {
      url: `${apiUrl}/api/sessions/create`,
      method: "POST",
      body: {},
    },
    expectedStatus: 400,
  },
  {
    name: "track_upgrade_requires_org_id",
    input: {
      url: `${apiUrl}/track-upgrade-click`,
      method: "POST",
      body: { source: "pricing_page" },
    },
    expectedStatus: 400,
  },
];

const results = await Promise.all(
  checks.map((check) =>
    runRequest(check.name, check.input, check.expectedStatus),
  ),
);

console.log(JSON.stringify({ results }, null, 2));
if (results.some((result) => !result.ok)) {
  process.exit(1);
}
