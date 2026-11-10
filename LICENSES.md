# Лицензии стороннего кода, шрифтов и образов

Всё стороннее в «На связи» распространяется под разрешающими лицензиями. Лицензии npm-пакетов прочитаны из поля `license` в `package.json` каждого установленного пакета (`node_modules/<пакет>/package.json`), список пакетов — из `npm ls --omit=dev --depth=0` (10.11.2026).

## Зависимости, которые попадают в приложение (production)

| Пакет | Версия | Лицензия | Зачем |
|---|---|---|---|
| `next` | 16.4.5 | MIT | Фреймворк (App Router, серверные действия) |
| `react` | 19.3.1 | MIT | Интерфейс |
| `react-dom` | 19.3.1 | MIT | Интерфейс |
| `drizzle-orm` | 0.45.4 | Apache-2.0 | ORM, параметризованные запросы к PostgreSQL |
| `postgres` | 4.1.0 | Unlicense | Драйвер PostgreSQL (в т. ч. `LISTEN/NOTIFY` для realtime) |
| `@node-rs/argon2` | 2.2.2 | MIT | Хеширование паролей argon2id (нативная сборка `@node-rs/argon2-*` — тоже MIT) |
| `zod` | 4.6.7 | MIT | Валидация входных данных на сервере |
| `lucide-react` | 1.70.0 | ISC | Иконки Lucide |
| `server-only` | 0.0.1 | MIT | Защита: серверные модули нельзя импортировать в клиентский код |
| `@fontsource-variable/literata` | 5.3.0 | OFL-1.1 | Шрифт заголовков (self-host) |
| `@fontsource-variable/golos-text` | 5.3.0 | OFL-1.1 | Шрифт интерфейса (self-host) |

Зависимости второго уровня, которые Next.js собирает в standalone-сборку, распространяются вместе с ним; их лицензии — в `node_modules/*/package.json` и `LICENSE` соответствующих пакетов.

## Шрифты

Оба шрифта подключены локально через `@fontsource-variable` (никаких внешних CDN), в обоих есть кириллица.

| Шрифт | Авторы | Лицензия |
|---|---|---|
| **Literata** (variable, ось `opsz`) | Copyright 2017 The Literata Project Authors (github.com/googlefonts/literata) | SIL Open Font License 1.1 |
| **Golos Text** (variable, ось `wght`) | Copyright 2019 The Golos Text Project Authors (github.com/googlefonts/golos-text) | SIL Open Font License 1.1 |

Полные тексты лицензий: `node_modules/@fontsource-variable/literata/LICENSE`, `node_modules/@fontsource-variable/golos-text/LICENSE`, https://openfontlicense.org.

## Иконки

**Lucide** (`lucide-react`) — лицензия **ISC**. В мастер-промпте по ошибке было указано MIT; лицензию сверили командой `npm view lucide-react license` и по `package.json` пакета (см. `docs/process/LOG.md`, ошибка ИИ №3).

## Docker-образы (деплой)

| Образ | Что внутри | Лицензия основного ПО |
|---|---|---|
| `node:24-alpine` | Node.js — сборка и запуск приложения | MIT (Node.js) |
| `postgres:17-alpine` | PostgreSQL 17 — база; в контейнере `cron` — `pg_dump` и `crond` | PostgreSQL License |
| `caddy:2` | Caddy — HTTPS (Let's Encrypt), сжатие, HSTS, обратный прокси | Apache-2.0 |

Образы основаны на Alpine Linux; входящие в него пакеты имеют собственные лицензии (например, BusyBox — GPL-2.0, musl — MIT). Код проекта с ними не линкуется, образы используются как есть. Сами лицензионные файлы в этих образах не лежат; лицензии указаны по сайтам проектов.

## Только для разработки (в приложение и образ не попадают)

| Пакет | Версия | Лицензия |
|---|---|---|
| `typescript` | 5.9.3 | Apache-2.0 |
| `vitest` | 5.1.0 | MIT |
| `@playwright/test` | 1.65.0 | Apache-2.0 |
| `@axe-core/playwright` (и `axe-core`) | 4.14.0 | MPL-2.0 |
| `drizzle-kit` | 0.31.11 | MIT |
| `eslint` | 9.39.5 | MIT |
| `eslint-config-next` | 16.4.5 | MIT |
| `tsx` | 4.23.15 | MIT |
| `@types/node`, `@types/react`, `@types/react-dom` | 24.19.2, 19.3.0, 19.3.0 | MIT |

## Логотип и данные

- Логотип «На связи» (`src/ui/Logo.tsx`, `src/app/icon.svg`) — **оригинальный**, нарисован для проекта в SVG: речевой пузырь со стрелкой-ориентиром. Не копирует и не повторяет логотипы реальных вузов.
- «Университет Ориентир», все люди, группы, оценки, обращения и статьи базы ответов **вымышлены**. Реальных данных и логотипов в проекте нет.
- Картинок и фотографий из сторонних источников в проекте нет.
