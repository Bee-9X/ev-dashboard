# syntax=docker/dockerfile:1
# PLUG EV core API. Cloud-neutral image: configuration comes only from environment variables (.env.example).

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Install scripts are not needed to build (the only ones belong to test-only and telemetry packages).
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Migrations run on startup (DB_RUN_MIGRATIONS=true). First Super Admin:
#   docker compose exec -it api node dist/cli/create-super-admin.js --email you@example.com --name "Your Name"
CMD ["node", "dist/main.js"]
