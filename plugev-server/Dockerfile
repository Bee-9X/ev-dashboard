# syntax=docker/dockerfile:1
# PLUG EV charger gateway (Phase 0 PoC): OCPP 1.5/1.6 SOAP and OCPP 1.6J on port 3003, legacy WebSocket port 3002.

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=3003 \
    LEGACY_WS_PORT=3002
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node index.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node tools ./tools
USER node
EXPOSE 3003 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3003)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "index.js"]
