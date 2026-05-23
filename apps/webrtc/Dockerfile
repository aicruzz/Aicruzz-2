FROM node:20-bookworm AS base
WORKDIR /app

# mediasoup native build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip make cmake g++ \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package*.json ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 4002
EXPOSE 40000-49999/udp

CMD ["node", "dist/index.js"]
