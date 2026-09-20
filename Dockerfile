# syntax=docker/dockerfile:1

FROM node:22.23.0-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

FROM node:22.23.0-bookworm-slim AS runtime

WORKDIR /app

# workerd uses the system trust store; Node's bundled roots do not cover it.
# Keep certificate verification enabled for real HTTPS website capture.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=5173 \
    CLOUDFLARE_CF_FETCH_ENABLED=false \
    CLOUDFLARE_INCLUDE_PROCESS_ENV=true \
    WRANGLER_SEND_METRICS=false \
    VITE_CACHE_DIR=/app/.sites-runtime/node_modules/.vite \
    CHOKIDAR_USEPOLLING=true

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

RUN mkdir -p /app/.sites-runtime /app/.wrangler \
    && chown node:node /app \
    && chown -R node:node /app/.sites-runtime /app/.wrangler

USER node

EXPOSE 5173

HEALTHCHECK --interval=10s --timeout=5s --start-period=45s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:5173/').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

FROM runtime AS verification

ENV CI=true
HEALTHCHECK NONE
CMD ["npm", "run", "verify"]

FROM runtime AS development

CMD ["sh", "-c", "npm run db:migrate:local && exec npm run dev"]
