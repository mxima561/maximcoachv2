#!/usr/bin/env node

const required = ["STAGING_WEB_URL", "STAGING_API_URL"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const checks = [
  { name: "web_home", url: `${process.env.STAGING_WEB_URL}/`, expected: 200 },
  { name: "web_login", url: `${process.env.STAGING_WEB_URL}/login`, expected: 200 },
  { name: "web_signup", url: `${process.env.STAGING_WEB_URL}/signup`, expected: 200 },
  { name: "web_favicon", url: `${process.env.STAGING_WEB_URL}/favicon.ico`, expected: 200 },
  { name: "api_health", url: `${process.env.STAGING_API_URL}/health`, expected: 200 },
];

const results = [];
let failed = false;

for (const check of checks) {
  try {
    const response = await fetch(check.url, { redirect: "manual" });
    const ok = response.status === check.expected;
    results.push({ ...check, status: response.status, ok });
    if (!ok) failed = true;
  } catch (error) {
    results.push({
      ...check,
      status: "FETCH_ERROR",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    failed = true;
  }
}

console.log(JSON.stringify({ checks: results }, null, 2));
if (failed) process.exit(1);
