# ── Build stage ──────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy only the packages needed for this service
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

COPY packages/auth/package.json packages/auth/tsconfig.json ./packages/auth/
COPY packages/auth/src ./packages/auth/src

COPY packages/voice-core/package.json packages/voice-core/tsconfig.json ./packages/voice-core/
COPY packages/voice-core/src ./packages/voice-core/src

COPY apps/coach/package.json apps/coach/tsconfig.json ./apps/coach/
COPY apps/coach/src ./apps/coach/src

# Install deps and build
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@maxima/coach

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

# Copy auth package (source)
COPY --from=builder /app/packages/auth/package.json /app/packages/auth/tsconfig.json ./packages/auth/
COPY --from=builder /app/packages/auth/src ./packages/auth/src

# Copy voice-core package (source)
COPY --from=builder /app/packages/voice-core/package.json /app/packages/voice-core/tsconfig.json ./packages/voice-core/
COPY --from=builder /app/packages/voice-core/src ./packages/voice-core/src

# Copy coach service (compiled JS)
COPY --from=builder /app/apps/coach/package.json ./apps/coach/
COPY --from=builder /app/apps/coach/dist ./apps/coach/dist

# Install production deps
RUN pnpm install --frozen-lockfile --prod
# tsx for runtime TS resolution of workspace packages
RUN npm install -g tsx

EXPOSE 3003

CMD ["node", "--import", "tsx", "apps/coach/dist/index.js"]
