# «На связи» — цифровой деканат (конкурсный прототип)

Кабинет студента вымышленного «Университета Ориентир». Концепт для конкурса, не официальный сервис.
Спека: `docs/specs/2026-11-07-na-svyazi-design.md`. План: `docs/plans/`. Мастер-промпт: `prompts/00-master-prompt.md`.

## Стек
TypeScript, Next.js (App Router), PostgreSQL (Drizzle ORM), Docker Compose, Caddy. Тесты: Vitest (с реальной БД), Playwright (e2e, 360 px и 1280 px).

## Правила
- Отвечать по-русски, коротко. Код, команды, имена файлов не переводить.
- Процесс через скиллы: brainstorming → writing-plans → TDD → frontend-design → webapp-testing → security-review → verification-before-completion.
- Только вымышленные данные. Никаких реальных ФИО, вузов, логотипов.
- Доступ к данным только через серверный слой с проверкой сессии и владельца. Никогда не доверять id из URL/формы для проверки прав.
- Пароли: argon2id. Секреты только в env. `.env*` не читать, не выводить, не коммитить (есть `.env.example`).
- Шрифты self-host, только с кириллицей и лицензией OFL/аналог. Всё стороннее — в `LICENSES.md`.
- Небольшие коммиты. Не пушить и не удалять без разрешения пользователя.
- Не говорить «готово» без запущенной проверки и увиденного результата.

## Журнал процесса (вести по ходу!)
- `docs/process/LOG.md` — что решили, какой промпт/скилл/субагент, ошибки ИИ и исправления, ручные шаги.
- `prompts/` — ключевые промпты по этапам. `docs/screenshots/` — скриншоты с подписями (и неудачные).
- `docs/process/TOOLS.md` — все инструменты и зачем.

## Команды
- `npm run db:up` — поднять Postgres (dev :5432 `nasvyazi`, test :5433 `nasvyazi_test`, tmpfs) через `docker-compose.dev.yml`.
- `npm run dev | build | start | lint` — Next.js. `npm test` — Vitest (нужна поднятая test-БД, `DATABASE_URL_TEST` из `.env`). `npm run test:e2e` — Playwright (папка `e2e/`, сам собирает и стартует на :3100). Скриншоты в `docs/screenshots/` пишутся только с `SCREENSHOTS=1` (bash: `SCREENSHOTS=1 npm run test:e2e`, PowerShell: `$env:SCREENSHOTS=1; npm run test:e2e`).
- `npm run db:generate | db:migrate | demo:reset` — Drizzle/демо; ссылаются на `drizzle.config.ts`, `scripts/migrate.ts`, `scripts/demo-reset.ts` (появятся в следующих задачах).
- `cp .env.example .env` — локальные переменные (не коммитить).

### Next.js 16 (сверено с `node_modules/next/dist/docs`)
- `middleware.ts` устарел и переименован в `proxy.ts` (в корне или `src/`), та же функциональность. Использовать `proxy.ts`.
- `instrumentation.ts` (корень или `src/`) экспортирует `register()` (один раз при старте сервера) и опционально `onRequestError`.
- Каркас создан с `cacheComponents`/`partialPrefetching` в конфиге; они убраны из `next.config.ts` (динамические страницы с БД требуют иначе Suspense вокруг всего).
- Vitest-конфиг — `vitest.config.mts` (ESM без предупреждения), `server-only` в тестах заменён пустым модулем.
