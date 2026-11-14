# Task 16 — Деплой: образ, compose, Caddy, ночной сброс, бэкап — отчёт

**Status:** DONE_WITH_CONCERNS (см. «Замечания»). Модель: Claude Opus 5.5. На удалённые серверы не заходил.

## Коммиты (ветка feat/volna-1, не запушено)
- `5256613` feat(boot): миграции и демо-мир при старте, /api/health, MIGRATIONS_DIR
- `fb7f0a9` fix(boot): завершать процесс, если база не подготовлена при старте
- `97b7e29` feat(deploy): docker, caddy, ночной сброс, бэкап
- `639c1db` docs(deploy): пошаговая инструкция деплоя на VPS для новичка
(`0840a2d` — коммит контроллера в LOG.md, не мой.)

## Что сделано
- `src/server/db/migrate.ts`: `migrationsFolder()` = `MIGRATIONS_DIR` || `cwd/drizzle`; `runMigrations(url)` прежней сигнатуры.
- `src/server/boot.ts`: `retry(fn, delaysMs, {sleep,onRetry})`; `prepareDatabase(url, {seed, delaysMs?, sleep?, log?}) → "seeded"|"ready"` — ждёт БД (`select 1`, паузы 1/2/4/8/15/30 с), под `pg_advisory_lock` применяет миграции, если пользователей нет — `seed()`; лог только с кодом ошибки (без адреса/пароля); `bootDatabase()` для instrumentation (seed = `resetDemo()`).
- `src/instrumentation.ts`: `register()` только при `NEXT_RUNTIME === "nodejs"`; при ошибке — `console.error` + `process.exit(1)`.
- `src/app/api/health/route.ts`: `GET` → `select 1` → 200 `{"ok":true}`, иначе 503 `{"ok":false}`, `cache-control: no-store`, без деталей ошибки.
- `e2e/security-headers.spec.ts`: `/api/health` → 200 и `{ok:true}`.
- `.dockerignore` (корень): `.env*`, `**/.env*`, node_modules, .next, .git, .superpowers, docs, prompts, e2e, tests, coverage, test-results, playwright-report, blob-report, scripts, deploy, backups, *.md, конфиги vitest/playwright.
- `deploy/Dockerfile`: `node:24-alpine`, 3 стадии (deps `npm ci` → build → runner); runner: WORKDIR /app, `NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NODE_OPTIONS=--max-old-space-size=256 MIGRATIONS_DIR=/app/drizzle`; копирует standalone, `.next/static`, `drizzle/` (public/ не копируется); код root-owned, пользователю `node` на запись только `.next/cache`; `USER node`; HEALTHCHECK `wget /api/health`; `CMD ["node","server.js"]`.
- `deploy/docker-compose.yml` (project `nasvyazi`): `app` (image `nasvyazi-app:latest` + build `..`/`deploy/Dockerfile`, `platform: linux/amd64`, только `expose: 3000`, env явным списком с `:?`, depends_on db healthy); `db` postgres:17-alpine (`shared_buffers=64MB`, `max_connections=30`, volume `db-data`, healthcheck pg_isready, пароль из env); `caddy:2` (80, 443, 443/udp; volumes caddy-data/config); `cron` postgres:17-alpine (busybox crond, `TZ=Europe/Moscow`, PG* env для pg_dump, `${BACKUP_DIR:-./backups}:/backups`); у всех `restart: unless-stopped` и ротация логов json-file 10m×3.
- `deploy/Caddyfile`: `{$SITE_HOST}`, `encode zstd gzip`, `header Strict-Transport-Security "max-age=31536000"`, `respond /api/internal/* 404`, `reverse_proxy app:3000 { flush_interval -1 }`; trusted_proxies не задан.
- `deploy/crontab`: `30 3 * * *` backup, `0 4 * * *` demo-reset.
- `deploy/demo-reset.sh`: HTTP-запрос собирает встроенный `printf` → FIFO → `busybox nc` (токен не в argv процессов и не в логе; печатается только строка статуса). busybox nc выходит сразу по концу ввода и не выходит после ответа, пока ввод открыт, поэтому ввод держит `sleep`, который убивается после чтения строки статуса.
- `deploy/backup.sh`: `pg_dump -Fc` во временный `.part` → переименование, хранит 7 последних (по имени-дате).
- `deploy/.env.example`: SITE_HOST (формат sslip.io объяснён), `APP_ORIGIN=https://${SITE_HOST}`, POSTGRES_PASSWORD (`openssl rand -hex 24`), `DATABASE_URL=postgres://nasvyazi:${POSTGRES_PASSWORD}@db:5432/nasvyazi` (интерполяцию Compose проверил), DEMO_PASSWORD_* = значения из README, DEMO_RESET_TOKEN (`openssl rand -hex 32`), COOKIE_SECURE=true, BACKUP_DIR (необязательно).
- `docs/DEPLOY.md` (по-русски, для новичка на Windows): аренда (Ubuntu 24.04, x86_64, 1 ГБ; Beget/Timeweb — цены сверить на сайтах), ssh-keygen в PowerShell, первый вход, ufw, Docker официальным способом (+ запасной `docker.io`), swap 1 ГБ, сборка `docker build --platform linux/amd64`, `docker save -o` трёх образов (app+postgres+caddy, чтобы серверу не тянуть Docker Hub) + `scp` + `docker load` с предупреждением про порчу двоичных данных конвейером PS 5.1, `.env` через `sed`+`openssl` (секреты не показываются), запуск, проверка сертификата sslip.io и план Б (домен + одна переменная, без AAAA), проверка с телефона без VPN, команды, обновление, бэкап/восстановление, неполадки, чек-лист перед отправкой, явная пометка «ассистент не деплоил и не заходил на сервер».

## TDD
- RED: `npx vitest run tests/health-route.test.ts tests/boot.test.ts tests/db/migrate.test.ts` → 3 files failed: `Cannot find package '@/server/boot'`, `Cannot find package '@/app/api/health/route'`, `migrationsFolder is not a function` (модулей/функции ещё нет — ожидаемо).
- GREEN: та же команда → `Test Files 3 passed (3) Tests 9 passed (9)`.
- Мутационная проверка: замена `pg_advisory_lock` на `select 1` → падает «две копии приложения стартуют одновременно … сид ровно один раз»; возвращено.
- Итог: `npm test` → `Test Files 40 passed (40), Tests 408 passed (408)`; `npx tsc --noEmit` ok; `npm run lint` ok; `npm run build` ok; `npx playwright test e2e/security-headers.spec.ts` → 14 passed.

## Локальная приёмка (Docker Desktop 29.6.2, Compose v5.3.1; deploy/.env с одноразовыми значениями, SITE_HOST=localhost)
1. Сборка linux/amd64: `docker compose -f deploy/docker-compose.yml build app` — ~47 с; образ `arch=amd64 os=linux user=node cmd=[node server.js]`. `up -d`: db healthy → app healthy; лог app: `Миграции применены, база была пустой — демо-мир собран`. Также проверено: `docker build --platform linux/amd64 -f deploy/Dockerfile -t nasvyazi-app:latest .` (команда из DEPLOY.md, без .env) собирается.
2. `curl -k https://localhost/api/health` → `{"ok":true}` HTTP 200. Заголовки `/api/health`: `Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `Via: 1.1 Caddy`. `/login`: CSP с `'nonce-…' 'strict-dynamic'`, HSTS, Alt-Svc h3; сжатие `Content-Encoding: gzip`; `http://localhost/login` → 308 на https.
3. Playwright (chromium, ignoreHTTPSErrors) на https://localhost: вход Алиной → `/`, h1 «Добрый день, Алина»; `/api/events` 200; cookie `__Host-ns_session: secure=true httpOnly=true sameSite=Lax path=/`; SSE через Caddy: `content-encoding=zstd`, первый кусок `": connected\n\n"` за 54–121 мс (flush работает); ошибок консоли 0.
4. `curl -k -X POST https://localhost/api/internal/demo-reset` → 404. Также 404 для `/API/Internal/demo-reset`, `/api/%69nternal/demo-reset`, `//api/internal/demo-reset`, `/api/./internal/demo-reset` — у всех нет `Via` (отвечает сам Caddy, до app не доходит).
5. Неудачный вход через Caddy с `X-Forwarded-For: 1.2.3.4` и `X-Real-IP: 1.2.3.4` → в `login_attempts`: `pair:xff.spoof.check|172.20.0.1`, `ip:172.20.0.1` (172.20.0.1 — шлюз сети `nasvyazi_default`, т. е. реальный клиент с точки зрения Caddy в Docker Desktop); 1.2.3.4 не записан.
6. `docker compose exec -T cron sh /deploy/demo-reset.sh` → `2026-11-10 15:07:24 MSK demo-reset: ok, демо-мир пересобран`, ~1 с; sessions 1 → 0, `users.created_at` обновился, 3 пользователя с логином. Неверный токен → `ОШИБКА: HTTP/1.1 404 Not Found` (exit 1); app остановлен → `ОШИБКА: нет ответа от app` (exit 1); после всех сценариев в контейнере нет висящих `sleep`/`nc`. Токен нигде не напечатан. В контейнере: crontab установлен, `date` → MSK, `printf is a shell builtin`. (Первая версия скрипта с простым `printf | nc` не дожидалась ответа — сброс выполнялся, но статус терялся; исправлено до коммита.) Отдельно ранее проверено, что busybox crond наследует env контейнера и вывод заданий попадает в `docker logs`.
   Бэкап: `backup.sh` → `backup: ok nasvyazi-2026-11-10_1508.dump (88.0K)`, с 8 фиктивными старыми файлами удалены 2 самых старых, осталось 7. Восстановление по DEPLOY.md: `delete from kb_articles` (25 → 0) → `stop app cron` → `pg_restore --clean --if-exists --no-owner` (exit 0) → `start` → kb=25, users=6, health ok.
   Старт без БД: db остановлена → app пишет `БД пока недоступна (EAI_AGAIN), попытка N через … мс`; db вернулась вовремя → `Миграции применены`, healthy. Если не вернулась: **до fb7f0a9** Next печатал ошибку register(), процесс жил, контейнер `unhealthy`, `/api/health` → `Internal Server Error` даже после подъёма БД (Docker unhealthy не перезапускает); **после** — `Подготовка БД не удалась, процесс завершается: getaddrinfo EAI_AGAIN db`, RestartCount=1, после старта db → healthy, `{"ok":true}`.
7. `docker stats --no-stream` после входа и обхода страниц: app 76.06 MiB, db 35.02 MiB, caddy 13.69 MiB, cron 0.4 MiB — ≈125 MiB. Во время сброса: app 89.5 MiB, db 39.5 MiB; пиковый RSS процесса Node (VmHWM) 191 MB. Итого в пике ≈ 250 МБ из 1 ГБ.
8. В финальном образе `find / -name ".env*"` → 0 файлов; пользователь `node`. Размер образа: 305 MB на диске (76.3 MB сжатого содержимого). `docker save` трёх образов (app+postgres+caddy) → 202 МБ, `docker load -i` его принимает. Проверено, что из папки только с файлами deploy (без исходников и Dockerfile) `docker compose create` берёт загруженный образ и не пытается собирать. `docker compose down` выполнен; тома — именованные тома Docker (`nasvyazi_db-data`, `nasvyazi_caddy-data`, `nasvyazi_caddy-config`), в репозиторий не попадают; бэкапы теста писались в scratchpad (`BACKUP_DIR`).

## Изменённые/созданные файлы
`.dockerignore`, `deploy/Dockerfile`, `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/crontab`, `deploy/demo-reset.sh`, `deploy/backup.sh`, `deploy/.env.example`, `docs/DEPLOY.md`, `src/instrumentation.ts`, `src/server/boot.ts`, `src/server/db/migrate.ts`, `src/app/api/health/route.ts`, `tests/boot.test.ts`, `tests/health-route.test.ts`, `tests/db/migrate.test.ts`, `e2e/security-headers.spec.ts`.

## Самопроверка
- Секреты не печатались: `docker compose config` только `--quiet`/с булевыми проверками через node; пароли в скриптах проверки читались из файла и не выводились.
- Файлы deploy в рабочей копии и в git — LF (`git ls-files --eol` → `i/lf w/lf`), `scp` из рабочей копии даст корректные sh-скрипты.
- `bootDatabase()` и `register()` юнит-тестами не покрыты (тонкая обвязка с `process.exit`); поведение проверено в Docker (п. 1, 6).

## Замечания (concerns)
1. **APP_ORIGIN код не читает** (grep по src пуст): Origin server actions Next сверяет с Host, который Caddy передаёт без изменений. Переменная оставлена в .env.example и в env app по требованию, с пояснением в комментарии.
2. **Выпуск сертификата Let's Encrypt для `*.sslip.io` не проверен** (нет сервера); локально Caddy использует внутренний CA. В DEPLOY.md — как проверить по логу и план Б (домен + одна переменная `SITE_HOST`).
3. Доступность `download.docker.com`/Docker Hub из РФ не проверена; в DEPLOY.md запасной путь (`docker.io` из Ubuntu, образы postgres/caddy переносятся файлом).
4. Пароли демо-учёток продублированы в `deploy/.env.example` из README (они публичные); при смене в README нужно менять и там — сказано в обоих местах.
5. После `register()` Next печатает «Ready» до окончания подготовки БД; запросы в это время ждут (prepare), это поведение Next.
6. Локально остались: `deploy/.env` (gitignored, одноразовые значения) и тома `nasvyazi_*` в Docker Desktop — можно удалить `docker compose -f deploy/docker-compose.yml down -v` и `rm deploy/.env`. Docker Desktop запускал я (был выключен после перезапуска сессии).

## Интерфейсы для следующих задач
- `GET /api/health` → 200 `{"ok":true}` | 503 `{"ok":false}`.
- `migrationsFolder(): string`, `runMigrations(url: string): Promise<void>` (src/server/db/migrate.ts).
- `retry<T>(fn, delaysMs, {sleep?, onRetry?}): Promise<T>`, `prepareDatabase(url, {seed, delaysMs?, sleep?, log?}): Promise<"seeded"|"ready">`, `bootDatabase(): Promise<void>`, `BOOT_RETRY_DELAYS_MS` (src/server/boot.ts).
- Ручной сброс на сервере: `docker compose exec cron sh /deploy/demo-reset.sh`; бэкап: `docker compose exec cron sh /deploy/backup.sh`.
