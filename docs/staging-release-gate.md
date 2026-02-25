# Staging Release Gate

This repository includes two workflows:

- `CI` (`.github/workflows/ci.yml`) for static quality gates on PRs and `main`.
- `Staging Release Gate` (`.github/workflows/staging-release-gate.yml`) for blocker-first staging validation.

## Required Staging Secrets

Set these in GitHub environment `staging`:

- `STAGING_WEB_URL`
- `STAGING_API_URL`
- `STAGING_AUTH_TOKEN`
- `STRIPE_WEBHOOK_SECRET`
- `STAGING_STRIPE_CUSTOMER_ID`
- `E2E_LOGIN_EMAIL`
- `E2E_LOGIN_PASSWORD`

## What The Gate Runs

1. `pnpm typecheck`
2. `pnpm build`
3. `pnpm lint`
4. `pnpm staging:smoke`
5. `pnpm --filter @maxima/api test:staging`
6. `pnpm --filter @maxima/api test:stripe`
7. `pnpm --filter @maxima/web test:e2e`

The workflow writes a machine-readable `release-report.json` artifact and fails if any check fails.

## Staging Fixture Helpers

Use API package scripts:

- Seed fixture org: `pnpm --filter @maxima/api seed:staging`
- Cleanup fixture org: `pnpm --filter @maxima/api cleanup:staging`

The seed/cleanup scripts require Supabase service-role credentials and fixture IDs via env vars.
