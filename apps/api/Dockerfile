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

COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src

# Install deps and build
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@maxima/api

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

# Copy api service (compiled JS)
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Install production deps
RUN pnpm install --frozen-lockfile --prod
# tsx for runtime TS resolution of workspace packages
RUN npm install -g tsx

EXPOSE 3001

CMD ["tsx", "apps/api/dist/index.js"]
