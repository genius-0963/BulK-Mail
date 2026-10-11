# ==========================================
# Bulk-Outreach-Sender Production Dockerfile
# ==========================================

# 1. Base Stage
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# 2. Dependencies Stage
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/gmail-campaign/package.json ./artifacts/gmail-campaign/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile || pnpm install

# 3. Builder Stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts ./artifacts
COPY --from=deps /app/lib ./lib
COPY --from=deps /app/scripts ./scripts
COPY . .

# Build all libraries, backend API, and frontend
ENV NODE_ENV=production
RUN pnpm run build

# 4. Production Runner Stage
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production
ENV PORT=3000

# Copy required production artifacts and built assets
COPY package.json pnpm-workspace.yaml ./
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=builder /app/artifacts/gmail-campaign/dist ./artifacts/gmail-campaign/dist
COPY --from=builder /app/lib ./lib
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
