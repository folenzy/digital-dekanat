### Task 5: Профиль, расписание, успеваемость, уведомления, объявления (чтение)

**Files:**
- Create: `src/server/profile.ts`, `schedule.ts`, `grades.ts`, `notifications.ts`, `announcements.ts`
- Test: `tests/student-read.test.ts`, `tests/idor.test.ts` (общий файл IDOR, его расширяют следующие задачи)

**Interfaces:**
- `getProfile(v: StudentViewer): Promise<Profile>` (ФИО, факультет, направление (код + название), профиль, курс, группа, форма, основа, номер студенческого, email, куратор).
- `getDay(v, date: Date): Promise<Lesson[]>`, `getWeek(v, anyDateInWeek: Date): Promise<{days: {dateKey; lessons: Lesson[]}[]; parity}>`, `getTodayOverview(v, now): Promise<{lessons: Lesson[]; current?: Lesson; next?: Lesson & {dateKey}}>`. `Lesson = {pair: number; start: 'HH:MM'; end; discipline; type; room; building; teacher; change?: {kind; was?: {room?; teacher?; start?}; note?}; cancelled: boolean}`. Время пар: 1 — 09:00–10:30, 2 — 10:40–12:10, 3 — 12:40–14:10, 4 — 14:20–15:50, 5 — 16:00–17:30, 6 — 17:40–19:10.
- `getStudySummary(v, now): Promise<{verdict: 'good'|'risks'|'debts'; avgLastSession: number|null; debts: Debt[]; risks: Risk[]; current: EnrollmentView[]; session: ExamView[]; history: SemesterGrades[]}>`. Вердикт: есть долги → `debts`; иначе есть риски (обязательная точка не сдана и срок ≤ 7 дней или прошёл) → `risks`; иначе `good`. Предварительная оценка по баллам: ≥85 «отлично», 70–84 «хорошо», 55–69 «удовлетворительно», <55 «неудовлетворительно».
- `listNotifications(v: Viewer, {unreadOnly}): Promise<NotificationView[]>`, `unreadCount(v)`, `markRead(v, id)`, `markAllRead(v)` — все фильтруют по `v.userId`.
- `listAnnouncementsFor(v: StudentViewer): Promise<AnnouncementView[]>` — аудитория `null` (всем), факультет, курс или группа студента; важные первыми.

- [ ] **Step 1:** Тесты: суббота → `getTodayOverview.lessons = []` и `next` — пара понедельника; 2026-11-07T21:30Z считается 8 ноября; изменение «перенос аудитории» отдаёт `was.room`; Алина → `verdict 'good'`, Денис → `'debts'`; объявление для группы ЭК-23-2 не видно Алине.
- [ ] **Step 2 (IDOR):** `markRead(alinaViewer, <id уведомления Дениса>)` не меняет его `read_at`; `listNotifications(alina)` не содержит ни одного уведомления Дениса.
- [ ] **Step 3:** Run → FAIL. Реализовать. Run → PASS. Commit `feat: чтение профиля, расписания, успеваемости, уведомлений`.

