### Task 16: Деплой — образ, compose, Caddy, ночной сброс, бэкап

**Files:**
- Create: `deploy/Dockerfile` (multi-stage, Next standalone, non-root user, `NODE_OPTIONS=--max-old-space-size=256`, копирует `drizzle/`), `deploy/docker-compose.yml` (`app`, `db` postgres:17-alpine с `shared_buffers=64MB`, `max_connections=30`, volume; `caddy:2` с volume для сертификатов; `cron` — alpine + curl, `0 4 * * *` TZ=Europe/Moscow → `POST http://app:3000/api/internal/demo-reset`), `deploy/Caddyfile` (`{$SITE_HOST}`, `respond /api/internal/* 404`, gzip/zstd, HSTS, `flush_interval -1` для `/api/events`), `deploy/backup.sh` (`pg_dump` раз в сутки, хранить 7), `deploy/.env.example`, `src/instrumentation.ts` (миграции при старте; если пользователей нет → `resetDemo()`), `src/app/api/health/route.ts` (`{ok:true}` + `select 1`), `docs/DEPLOY.md`.

- [ ] **Step 1:** Локально: `docker compose -f deploy/docker-compose.yml up -d --build` с `SITE_HOST=localhost` → `curl -k https://localhost/api/health` → `{"ok":true}`; вход Алиной работает; `curl -k -X POST https://localhost/api/internal/demo-reset` → 404 (закрыт снаружи).
- [ ] **Step 2:** `docs/DEPLOY.md` для новичка: аренда VPS (Ubuntu 24.04, 1 ГБ), SSH-ключ, установка Docker, swap 1 ГБ, перенос образа (`docker save | ssh … docker load`), `.env` на сервере, `SITE_HOST=<IP>.sslip.io` (и как заменить на домен), запуск, проверка с телефона без VPN, обновление, бэкап и восстановление, перезапуск. Пометка: на сервер ассистент не заходит без разрешения.
- [ ] **Step 3:** Commit `feat(deploy): docker, caddy, ночной сброс, бэкап, инструкция`.

