# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: Build Application
# ==========================================
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile || pnpm install

COPY . .

RUN pnpm run build

# ==========================================
# Stage 2: Stateless Production Runner
# ==========================================
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /app/.output ./.output

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/auth/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
