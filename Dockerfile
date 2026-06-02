# syntax=docker/dockerfile:1.7

# ─── Stage 1: deps ────────────────────────────────────────────────────────────
# Install all node_modules, including building the better-sqlite3 native binary
# against this image's Node + glibc. We're on Debian (not Alpine/musl) because
# better-sqlite3 ships prebuilt binaries for glibc and avoids a slow rebuild.
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 3: runner ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user for the runtime — limits blast radius if something goes wrong.
RUN groupadd --system --gid 1001 nextjs \
 && useradd  --system --uid 1001 --gid nextjs --home /app --no-create-home nextjs

# Standalone bundle: minimal node_modules + the .next runtime + server.js
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
# Static assets aren't part of the standalone bundle by design (CDN-targeted)
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

# Persistent SQLite directory — bind/volume-mount this in compose/run.
RUN mkdir -p /app/data && chown nextjs:nextjs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000

# Health check: hit the homepage; healthy if 2xx/3xx.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
