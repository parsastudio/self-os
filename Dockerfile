# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: Build Application
# ==========================================
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

RUN corepack enable && corepack prepare pnpm@latest --activate

# Install build toolchain required for native addons (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile -- shamefully-hoist=false || pnpm install

COPY . .

RUN pnpm run build

# ==========================================
# Stage 2: Production Runner
# ==========================================
FROM node:22-bookworm-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
ENV DATABASE_URL=/app/data/local.db

RUN corepack enable && corepack prepare pnpm@latest --activate

# Install build tools temporarily to ensure native better-sqlite3 binding inside .output/server
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install production native dependencies inside .output/server and clean up build packages
RUN cd .output/server \
    && npm pkg delete devDependencies \
    && pnpm install --prod --no-lockfile \
    && pnpm store prune \
    && apt-get purge -y --auto-remove python3 make g++ \
    && mkdir -p /app/data \
    && chown -R node:node /app

USER node

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/auth/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
