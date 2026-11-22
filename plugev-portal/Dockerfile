# syntax=docker/dockerfile:1
# PLUG EV portal (Phase 0 template + charger console). React settings are baked in at build time,
# so the API address is a build argument, not a runtime variable.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --force: the template's dependency tree has peer conflicts (see instructions.txt)
RUN npm ci --force --ignore-scripts --no-audit --no-fund
COPY public ./public
COPY src ./src
ARG REACT_APP_API_URL=http://localhost:3003
ARG REACT_APP_API_KEY=
# CI=false: the template has lint warnings that would otherwise fail the build
ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    REACT_APP_API_KEY=$REACT_APP_API_KEY \
    CI=false \
    GENERATE_SOURCEMAP=false
RUN npm run build

# Unprivileged nginx (runs as a non-root user, listens on 8080)
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
