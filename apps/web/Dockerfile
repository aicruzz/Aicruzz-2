FROM node:20-alpine AS base
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
RUN npm install --legacy-peer-deps

# ── Builder ───────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build

# ── Runner ────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/next.config.ts ./next.config.ts
COPY --from=deps /app/apps/web/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
