FROM node:22-slim AS base

# better-sqlite3 needs a native build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-slim

RUN apt-get update && apt-get install -y libstdc++6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
# native module built against the same node version
COPY --from=base /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

EXPOSE 3000
CMD ["node", "server.js"]
