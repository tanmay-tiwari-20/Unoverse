# syntax=docker/dockerfile:1

# ---- Build stage: install all deps and compile TypeScript ----
FROM node:20.19.1-alpine3.21 AS build
WORKDIR /app

# Install dependencies first (better layer caching).
COPY package*.json ./
RUN npm ci

# Compile src -> dist.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production stage: slim image with only runtime deps + compiled output ----
FROM node:20.19.1-alpine3.21 AS production
WORKDIR /app
ENV NODE_ENV=production
# Default listen port for the CONTAINER. Managed platforms inject their own PORT
# (Railway/Render/Fly do) and that always wins; this only decides what the image
# does when nobody says otherwise. 8080 is the convention those platforms expect,
# so the image, the EXPOSE below, the healthcheck and a platform's "target port"
# setting can never disagree by default. Outside Docker the app still falls back
# to 3001 (see src/index.ts), which is what local dev and .env.example use.
ENV PORT=8080

# Only production dependencies (no typescript, vitest, ts-node-dev, etc.).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled JS from the build stage.
COPY --from=build /app/dist ./dist

# Create data directory and set ownership to node user
RUN mkdir -p /app/.data && chown -R node:node /app/.data

# Run as the built-in unprivileged 'node' user rather than root.
USER node

# The app reads PORT from env (defaults to 8080 in this image, see ENV above).
EXPOSE 8080

# Container-level health check hitting the /health endpoint. Uses Node's own
# fetch (available in Node 20) so no extra tooling (curl/wget) is needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
