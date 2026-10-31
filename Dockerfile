FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY scripts/copy-pyodide.mjs scripts/copy-pyodide.mjs
RUN npm ci
COPY . .
RUN npm run build && node scripts/build-server.mjs

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
# Browser-backed research and visual tools use Chromium in server deployments.
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    LH_DATA_DIR=/state/data LH_AUTH_FILE=/state/auth.json CHROME_PATH=/usr/bin/chromium
COPY --from=build --chown=node:node /app/.next/standalone ./
RUN mkdir /state && chown node:node /state
USER node
EXPOSE 3000
CMD ["node", "server.js"]
