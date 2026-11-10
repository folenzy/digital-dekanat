# syntax=docker/dockerfile:1
# Образ приложения «На связи»: Next.js standalone (node server.js) + миграции drizzle/.
# Собирается локально из корня репозитория (контекст — `..` в deploy/docker-compose.yml, фильтр — .dockerignore):
#   docker compose -f deploy/docker-compose.yml build app
# На сервер переносится готовым (docs/DEPLOY.md): на VPS с 1 ГБ сборка Next не поместится в память.

FROM node:24-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /src/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=256 \
    NEXT_TELEMETRY_DISABLED=1 \
    MIGRATIONS_DIR=/app/drizzle
# Код принадлежит root и только читается; пользователю node доступна на запись лишь .next/cache.
# public/ в проекте нет; .next/static server.js сам не раздаёт — кладём рядом (документация Next, output: standalone).
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/drizzle ./drizzle
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
