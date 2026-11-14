# Task 5 report: чтение профиля, расписания, успеваемости, уведомлений, объявлений

Status: DONE. Commits: c0b18dc `refactor(demo): группы названы по году поступления`, затем `feat: чтение профиля, расписания, успеваемости, уведомлений`.

## Что сделано
- Переименование: ПМИ-24-1/2 -> ПМИ-25-1/2, ЭК-23-1/2 -> ЭК-24-1/2, ЛИН-25-1 -> ЛИН-26-1; зачётки ОР-24-xxxx -> ОР-25-xxxx, ОР-23-xxxx -> ОР-24-xxxx (src, tests, README, spec, plan).
- Новые файлы: `src/server/{profile,schedule,grades,notifications,announcements,deadlines,audience}.ts`; в `time.ts` добавлены `shiftDateKey`, `mskAt`, `mskMinutes`. Тесты: `tests/student-read.test.ts` (27), `tests/idor.test.ts` (5, общий, расширять).
- `audience.ts` (`audienceFilter`) — общий фильтр аудитории (факультет/курс/группа, null = любой) для объявлений и дедлайнов.

## Тесты и TDD
- Честно: тесты писались после первого наброска schedule/profile, поэтому классического RED не было. Первый запуск упал только на неверном пути импорта хелпера; после исправления 32/32 зелёные сразу. Чувствительность IDOR проверена мутацией: убрал фильтр `userId` в `markRead` -> `tests/idor.test.ts` падает («markRead чужого уведомления»), после возврата зелёный.
- `npm test`: 13 files, 99 passed. `npx tsc --noEmit` чисто, `npm run lint` чисто, `npm run build` ок.
- Покрыто: суббота (lessons [], next = пн 16.11 пара 2), 2026-11-07T21:30Z = 8 ноября, was.room / was.teacher / was.start, отмена остаётся в списке и не считается идущей, чётность, неделя пн–сб, Алина `good` (avg 4.8), Денис `debts` (avg 3.25, зачёт не считается; пересдача А-218), `risks` (после правки данных), просроченная точка, объявление ЭК-24-2 не видно Алине, IDOR по уведомлениям, отсутствие чужих данных в JSON всех функций.

## Экспортируемые типы и сигнатуры
- `profile.ts`: `getProfile(v: StudentViewer): Promise<Profile>`; `Profile = {lastName; firstName; middleName: string|null; fullName; initials; faculty: {code; name}; program: {code; name; profile: string|null}; course; group: string; studyForm; funding; recordBookNo; email: string|null; curatorName: string|null}`.
- `schedule.ts`: `PAIR_TIMES`; `Lesson = {pair; start; end; discipline; type: 'lecture'|'practice'|'lab'; room; building: string|null; teacher; change?: {kind: 'moved'|'cancelled'|'teacher'|'room'|'extra'; was?: {room?; teacher?; start?}; note?}; cancelled: boolean}`; `getDay(v, date): Promise<Lesson[]>`; `getWeek(v, date): Promise<{days: {dateKey; lessons}[] (пн–сб); parity: 'odd'|'even'}>`; `getTodayOverview(v, now): Promise<{lessons; current?: Lesson; next?: Lesson & {dateKey}}>` (next ищется до 14 дней вперёд, пропуская отменённые).
- `grades.ts`: `currentSemester(course, now)`, `preliminaryGrade(points)`, `listRequiredOpenCheckpoints(studentId, semester)`; `getStudySummary(v, now): Promise<StudySummary>`;
  `StudySummary = {verdict: 'good'|'risks'|'debts'; avgLastSession: number|null; debts: Debt[]; risks: Risk[]; current: EnrollmentView[]; admission: {admitted; denied; pending}; session: ExamView[]; history: SemesterGrades[]}`;
  `EnrollmentView = {id; disciplineId; discipline; semester; controlForm; points|null; finalGrade|null; admitted: boolean|null; preliminary: string|null; checkpoints: {id; title; maxPoints; score|null; dueDate 'YYYY-MM-DD'; required}[]}`;
  `ExamView = {id; disciplineId; discipline; kind: 'exam'|'credit'|'retake'; startsAt: Date; room; building|null; individual: boolean; result: string|null}`;
  `Debt = {enrollmentId; discipline; semester; grade; retake: ExamView|null}`;
  `Risk = {enrollmentId; checkpointId; discipline; title; dueDate; overdue: boolean; daysLeft: number}`;
  `SemesterGrades = {semester; average: number|null; entries: {discipline; controlForm; points; finalGrade}[]}` (history: от новых семестров к старым).
- `notifications.ts`: `NotificationView = {id; kind; title; body; href: string|null; createdAt: Date; read: boolean; readAt: Date|null}`; `listNotifications(v: Viewer, {unreadOnly?}={})`, `unreadCount(v): number`, `markRead(v, id: number): boolean`, `markAllRead(v): number` (сколько изменено).
- `announcements.ts`: `AnnouncementView = {id; title; body; important; publishedAt: Date; audience: string}` («Всем» или «ФПМИ · 2 курс · группа»); `listAnnouncementsFor(v)`.
- `deadlines.ts`: `DeadlineView = {kind: 'deadline'|'checkpoint'; title; due: Date; href?}`; `listUpcomingDeadlines(v, now, days=14)`.

## Решения и оговорения
- Идущая пара: `start <= минуты МСК <= end` (границы включительно, минуты целые).
- `Lesson.building` может быть null (rooms.building nullable); для 'extra' без аудитории/преподавателя подставляется «уточняется».
- `deadlines`: строка попадает, если `ends_at >= now` и `starts_at <= now+days` (уже идущие окна показываются всегда; `days` сужает окно только для будущих окон и контрольных точек). Контрольная точка: `due` = 23:59 МСК дня срока, только `today <= due_date <= today+days` (просроченные — в `risks`, не в дедлайнах); `href` точки `/study`, окна со стипендией — `/dekanat/new?type=<код>`.
- Долги берутся по всем прошлым семестрам (не только последнему); `avgLastSession` — только по семестру `current-1`.
- Предварительная оценка применяется ко всем формам контроля при наличии баллов (у Алины по Матану 35 баллов -> «неудовлетворительно», т.к. часть точек ещё не сдана; UI стоит подписать «по набранным баллам»).
- `admission` и `ExamView.result` добавлены сверх брифа (спека 7.4: допуски и результаты сессии).
- В `world.ts` остались собственные копии `shiftKey`/`mskAt` (не трогал, чтобы не раздувать диф).
