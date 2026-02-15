# ── Build stage ──────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy only the packages needed for this service
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

COPY apps/voice/package.json apps/voice/tsconfig.json ./apps/voice/
COPY apps/voice/src ./apps/voice/src

# Install deps and build
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@maxima/voice

# ── Production stage ─────────────────────────────────────────
FROM node:22-slim AS runner

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace root
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy shared package (compiled)
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy voice service (compiled)
COPY --from=builder /app/apps/voice/package.json ./apps/voice/
COPY --from=builder /app/apps/voice/dist ./apps/voice/dist

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

EXPOSE 3002

CMD ["node", "apps/voice/dist/index.js"]
