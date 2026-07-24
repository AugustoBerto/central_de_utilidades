FROM node:22-trixie-slim AS dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace @painel/backend

FROM node:22-trixie-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /app/node_modules ./node_modules
COPY backend ./backend
RUN chown -R node:node /app \
  && chmod +x /app/backend/docker-entrypoint.sh
WORKDIR /app/backend
EXPOSE 3000
ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
