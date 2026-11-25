# syntax=docker/dockerfile:1.7
# ==============================================================================
# LoRaPulse v0.0.1 – Multi-Stage Hardened Production Dockerfile
# Single-Entrypoint Container (Fastify API + SSE + Static Vite PWA on Port 8080)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder (Compiles @lorapulse/shared, @lorapulse/frontend, @lorapulse/backend)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY simulator/package.json ./simulator/

RUN npm ci

COPY packages/shared ./packages/shared
COPY frontend ./frontend
COPY backend ./backend

RUN npm run build -w @lorapulse/shared \
  && npm run build -w @lorapulse/frontend \
  && npm run build -w @lorapulse/backend

# ------------------------------------------------------------------------------
# Stage 2: Production Dependencies (Lean runtime tree without dev/frontend deps)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY simulator/package.json ./simulator/

RUN npm ci --omit=dev --workspace=@lorapulse/shared --workspace=@lorapulse/backend --include-workspace-root=false \
  && npm cache clean --force

# ------------------------------------------------------------------------------
# Stage 3: Hardened Unprivileged Runtime Image
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    APP_PORT=8080 \
    FRONTEND_DIST_PATH=/app/frontend/dist

COPY --from=prod-deps --chown=node:node /app/package.json ./package.json
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=builder --chown=node:node /app/backend/dist ./backend/dist
COPY --from=builder --chown=node:node /app/frontend/dist ./frontend/dist

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "backend/dist/index.js"]
