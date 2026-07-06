# syntax=docker/dockerfile:1

# ---- Build stage: install all deps and compile TypeScript ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first (better layer caching).
COPY package*.json ./
RUN npm ci

# Compile src -> dist.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production stage: slim image with only runtime deps + compiled output ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies (no typescript, vitest, ts-node-dev, etc.).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled JS from the build stage.
COPY --from=build /app/dist ./dist

# Create data directory and set ownership to node user
RUN mkdir -p /app/.data && chown -R node:node /app/.data

# Run as the built-in unprivileged 'node' user rather than root.
USER node

# The app reads PORT from env (defaults to 3001). Document the default here.
EXPOSE 3001

# Container-level health check hitting the /health endpoint. Uses Node's own
# fetch (available in Node 20) so no extra tooling (curl/wget) is needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
