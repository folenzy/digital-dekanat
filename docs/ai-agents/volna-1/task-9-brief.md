### Task 9: Realtime через SSE и LISTEN/NOTIFY

**Files:**
- Create: `src/server/realtime.ts`, `src/app/api/events/route.ts`, `src/ui/live/LiveEvents.tsx` (клиент)
- Modify: `src/server/appeals/*.ts`, `src/server/announcements.ts` (вызов `publish`)
- Test: `tests/realtime.test.ts`

**Interfaces:**
- `publish(userIds: string[], event: LiveEvent): Promise<void>` — `pg_notify('ns_events', json)`; `LiveEvent = {type: 'notification'|'appeal_updated'|'announcement'; title?: string; href?: string; appealId?: string}`.
- `subscribe(userId, cb): () => void` — один общий `LISTEN` на процесс, раздаёт подписчикам по `userId`.
- `GET /api/events`: без сессии → 401; `text/event-stream`, `cache-control: no-store`, heartbeat-комментарий каждые 25 с; при пропаже сессии (ночной сброс, выход) поток закрывается.
- Клиент `LiveEvents`: `EventSource('/api/events')`; на событие — тост с `title` и ссылкой, `router.refresh()`; обновляет счётчик в колокольчике.
- Создание объявления (`createAnnouncement(v: StaffViewer, {title ≤120; body ≤3000; audience; important})`, лимит 10/час) публикует событие всем студентам аудитории и создаёт им уведомления.

- [ ] **Step 1:** Тесты: подписчик Алины получает событие, адресованное Алине, и не получает адресованное Денису; `replyAppeal` по обращению Дениса публикует событие только Денису.
- [ ] **Step 2:** Run → FAIL. Реализовать. Run → PASS. Commit `feat: уведомления в реальном времени`.

