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
# Copy workspace root (include tsconfig.base.json for tsx resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy shared package (source — tsx resolves .ts imports at runtime)
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/tsconfig.json ./packages/shared/
COPY --from=builder /app/packages/shared/src ./packages/shared/src

# Copy voice service (compiled JS)
COPY --from=builder /app/apps/voice/package.json ./apps/voice/
COPY --from=builder /app/apps/voice/dist ./apps/voice/dist

# Install production deps
RUN pnpm install --frozen-lockfile --prod
# tsx for runtime TS resolution of workspace packages
RUN npm install -g tsx

EXPOSE 3002

CMD ["tsx", "apps/voice/dist/index.js"]
