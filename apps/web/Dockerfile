# ── Build stage ──────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy shared package
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

# Copy web app
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.ts ./apps/web/
COPY apps/web/postcss.config.mjs ./apps/web/
COPY apps/web/instrumentation.ts ./apps/web/
COPY apps/web/sentry.client.config.ts apps/web/sentry.edge.config.ts apps/web/sentry.server.config.ts ./apps/web/
COPY apps/web/components.json ./apps/web/
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public

# Install deps and build
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_VOICE_URL
ARG NEXT_PUBLIC_SENTRY_DSN

RUN pnpm turbo build --filter=@maxima/web

# ── Production stage ─────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
