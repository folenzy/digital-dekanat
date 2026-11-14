# Task 9 report: Realtime через SSE и LISTEN/NOTIFY

Commit: a5ffea5 `feat: уведомления в реальном времени` (branch feat/volna-1).

## Реализовано
- `src/server/realtime.ts`: `publish` режет адресатов на пачки по 150 (все пачки одним оператором `select pg_notify(...), pg_notify(...)`), проверка 7900 байт на каждую пачку сохранена; `subscribe`; общий ленивый `pg.listen` (postgres.js сам переподключается и вызывает LISTEN заново); `listenReady()`; `stopRealtime()`.
- `src/server/events-stream.ts`: `openEventStream(req, heartbeatMs)`: вся логика SSE (вынесена из route для тестируемости интервала).
- `src/app/api/events/route.ts`: `runtime='nodejs'`, `dynamic='force-dynamic'`, `GET` -> `openEventStream(req, 25_000)`.
- `src/ui/live/LiveEvents.tsx`: клиент (нигде не смонтирован).
- `src/server/announcements.ts`: `createAnnouncement`; `src/server/limits.ts`: `LIMITS.announcement` (10/час, action `announcement_create`).
- Тесты: `tests/realtime.test.ts` (11 тестов). Существующий `tests/appeals/realtime.test.ts` без изменений и проходит.

## Сигнатуры
- `publish(userIds: string[], event: LiveEvent): Promise<void>`; `MAX_IDS_PER_NOTIFY = 150`; `LIVE_CHANNEL`.
- `subscribe(userId: string, cb: (event: LiveEvent) => void): () => void` (cb получает только `event`).
- `listenReady(): Promise<void>`; `stopRealtime(): Promise<void>` (для тестов).
- `openEventStream(req: NextRequest, heartbeatMs?: number): Promise<Response>`; `HEARTBEAT_MS = 25_000`.
- `createAnnouncement(v: StaffViewer, input: { title; body; important: boolean; audience: { facultyId?; course?; groupId? } }, now = new Date()): Promise<Result<{ id: number }>>`; ошибки `validation` (с `fieldErrors`, ключи `title`, `body`, `audience.facultyId`, `audience.groupId`, ...) и `rate_limited`. Тип `CreateAnnouncementInput`.
  - Порядок: zod -> существование факультета/группы (и совместимость группы с факультетом/курсом) -> лимит -> транзакция (объявление + уведомления kind `announcement`, href `/notifications?tab=announcements`, пачками по 1000) -> `publishSafe` после коммита.

## SSE-контракт
- Нет/неверная сессия -> 401. LISTEN недоступен -> 503.
- Заголовки: `content-type: text/event-stream; charset=utf-8`, `cache-control: no-store`, `x-accel-buffering: no`.
- Первый чанк `: connected\n\n`; событие `data: <json LiveEvent>\n\n`; каждые 25 с `: ping\n\n` с перепроверкой сессии; если сессии нет: `event: session_end\ndata: {}\n\n` и закрытие потока. Отписка и очистка таймера при abort запроса / cancel.

## Клиентский контракт (`LiveEvents`)
- `EventSource('/api/events')`; на сообщение: тост (`role="status"`, `aria-live="polite"`, заголовок + ссылка «Открыть», скрытие через 6 с), `window.dispatchEvent(new CustomEvent('ns:live', { detail }))`, `router.refresh()`.
- `detail` = `LiveEventDetail` = `{ type: 'notification'|'appeal_updated'|'announcement'; title?: string; href?: string; appealId?: string }` (экспортируется из LiveEvents.tsx).
- `session_end` -> закрывает EventSource, `window.location.assign('/login?reason=expired')` (eslint-disable для правила next про location.assign, намеренно полная перезагрузка).
- Закрывает EventSource при размонтировании.

## Тесты и проверки
- `npx vitest run tests/realtime.test.ts`: 11 passed.
- `npm test`: 20 files, 200 tests passed. `npx tsc --noEmit`: чисто. `npx eslint src tests`: чисто. `npm run build`: успешно, `/api/events` динамический.
- Покрыто: Алина получает своё и не получает событие Дениса; отписка; replyAppeal по обращению Дениса -> только Денис; 400 адресатов (3 пачки) доходят всем; 401 без cookie и с мусорным токеном; text/event-stream + заголовки + свои события и не чужие; ping и session_end после удаления сессии (heartbeat 80 мс) и конец потока; createAnnouncement для ЭК-24-2 (Денис да, Алина нет), курс 2, валидация, лимит 10/час.

## TDD-честность
RED-прогон не зафиксирован: реализация была написана до тестового файла, первый запуск тестов сразу прошёл (11/11). Тесты проверяют реальное поведение на настоящем LISTEN в тестовой БД, но «падение до реализации» не демонстрировалось.

## Замечания / concerns
- Тесты закрывают общий пул приложения через `sql.end()` из `@/server/db/client` и `stopRealtime()`; vitest завершается чисто.
- Первое событие после (пере)подключения LISTEN может потеряться, пока соединение переподключается: на клиенте это компенсирует `router.refresh()` при следующем событии, а данные всегда есть в `notifications`.
- Каждый SSE-клиент держит интервал и раз в 25 с делает один запрос в БД (getSessionUser; он же обновляет last_seen раз в минуту).

## Fix round 1
Changes:
- `LiveEvents.tsx`: `isSafeHref` (только `/x`, не `//`, не `/\`) для ссылки тоста и для `detail`; `parseLiveEvent` (не объект или неизвестный `type` -> игнор, без тоста и `ns:live`; небезопасный href отбрасывается, лишние поля убираются); при `error` с `readyState === CLOSED` проба `fetch('/api/events?probe=1')`: 401 -> `/login?reason=expired`, иначе переподключение через 3 с; очистка при размонтировании.
- `events-stream.ts`: `?probe=1` -> 204 при валидной сессии (401 иначе), поток не открывается; `req.signal.aborted` проверяется после `getSessionUser`, после `listenReady()` (ответ 499 без потока) и внутри `start` после подписки (сразу cleanup).
- `realtime.ts`: `subscriberCount()` для тестов утечек.
Tests: tests/realtime.test.ts (+3: abort снимает подписку и таймер, fake timers; abort до открытия потока; probe 204/401), tests/live-events-parse.test.ts (+2).
Command: `npm test`, `npx tsc --noEmit`, `npx eslint src tests`, `npm run build`. Output: см. ниже в ответе (все зелёные).

## Fix round 2
Changes: `isSafeHref` (src/ui/live/LiveEvents.tsx) now requires `/^\/(?![\/\x5c])[^\x00-\x20\x7f]*$/` (no whitespace or control characters anywhere, not `//`, not `/\`), and where `location` exists additionally `new URL(href, location.origin).origin === location.origin`.
Tests: tests/live-events-parse.test.ts adds `"/<tab>/evil.com"`, `"/<LF>/evil.com"`, `"/<CR>/evil.com"`, leading/trailing space, embedded newline, NUL.
Command: `npm test` (21 files, 205 passed), `npx tsc --noEmit`, `npx eslint src tests`, `npm run build`: all clean.
