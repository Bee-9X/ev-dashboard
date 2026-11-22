# syntax=docker/dockerfile:1
# PLUG EV admin portal. Vite settings are baked in at build time, so the API address is a build argument.
# API_ORIGIN (runtime) is the only origin the browser may call, enforced by the Content Security Policy.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# esbuild's install script only re-checks its binary; the platform package installs without it
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
ARG VITE_API_URL=http://localhost:4000/api/v1
ARG VITE_CONSOLE_URL=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_CONSOLE_URL=$VITE_CONSOLE_URL
RUN npm run build

# Unprivileged nginx (non-root, port 8080). Files in /etc/nginx/templates get ${ENV} substitution at start.
FROM nginxinc/nginx-unprivileged:stable-alpine
ENV API_ORIGIN=http://localhost:4000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
