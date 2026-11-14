# Task 7 report: «Деканат пишет первым»

Status: DONE. Commit: 0f0c846 `feat: деканат пишет первым`.

## Что сделано
- `src/server/nudges.ts`: `computeNudges` (чистая), `loadNudgeContext`, `getNudges`. Правила по спеке §7.8; максимум 3, порядок `needs_info, cert_ready, debt, admission_risk, stipend_increased, schedule_change` (стабильная сортировка).
- `src/server/format.ts`: русские даты по Москве.
- `deadlines.ts`: `DeadlineView` получил необязательные `startsAt` и `appealTypeCode` (для окна стипендии; существующие тесты не затронуты).
- Follow-up (b): `listRequiredOpenCheckpoints(v: StudentViewer, semester)`; вызовы в `grades.ts` и `deadlines.ts` обновлены.
- Follow-up (a): тест в `tests/student-read.test.ts`: `now = 2026-11-09T21:30Z` -> `lessons` равны `getDay(alina, TUE)`, `next.dateKey = '2026-11-10'`, пара 1.

## Решения
- Стипендия: средняя из `avgLastSession` (только числовые), оценки прошлой сессии из `history` по семестру `current-1`, долги — любые; окно `startsAt <= now <= endsAt` из строки `deadlines` с `appeal_type_code = 'stip_increased'`; заявление `stip_increased` в любом статусе кроме `rejected` скрывает карточку.
- Риск недопуска: точка просрочена или `daysLeft <= 7`, и дней до ближайшего будущего экзамена/зачёта (не пересдачи) `<= 45` по датам МСК (ровно 45 — да, 46 — нет). Карточка на каждую точку.
- cert_ready: статус `ready` и есть `pickup` (место и срок). Срок в тексте всегда абсолютной датой («до 13 ноября»).
- debt: одна карточка на долг; с пересдачей — «сегодня/завтра/дата в ЧЧ:ММ», ссылка `/study?tab=session`.
- schedule_change: одна карточка на день (сегодня, завтра по МСК), в тексте перечень изменённых пар; id `schedule_change:<YYYY-MM-DD>`.
- Контекст берёт обращения через `listMyAppeals` (active+done) и `getMyAppeal` только для `ready` (за `pickup`).

## Тесты и TDD
- RED: `npx vitest run tests/nudges.test.ts` -> «Failed to resolve import @/server/nudges» (модуля нет, ожидаемо).
- GREEN: тот же запуск -> 17 passed (границы 4,5/4,49, тройка/двойка/незачёт, долг, окно закрыто/не открыто, `stip_increased` в каждом статусе и `rejected`, 45/46 дней, лимит 3 и порядок, стабильные id, демо-мир: Алина `stipend_increased` с «4,8», Денис `needs_info, cert_ready, debt`, карточка пропадает после подачи заявления).
- `npm test`: 18 files, 174 passed. `npx tsc --noEmit`, `npm run lint`, `npm run build` — чисто.
- Честно: для follow-up (a) тест сразу зелёный (логика `getTodayOverview` уже корректна), RED не было.

## Файлы
Созданы: `src/server/nudges.ts`, `src/server/format.ts`, `tests/nudges.test.ts`. Изменены: `src/server/grades.ts`, `src/server/deadlines.ts`, `tests/student-read.test.ts`.

## Интерфейсы
- `nudges.ts`: `type NudgeKind = 'needs_info'|'cert_ready'|'debt'|'admission_risk'|'stipend_increased'|'schedule_change'`; `type Nudge = {id: string; kind: NudgeKind; title: string; body: string; action: {label: string; href: string}}`; `type NudgeAppeal`, `type NudgeContext = {appeals; debts: Debt[]; risks: Risk[]; avgLastSession: number|null; lastSessionGrades: (string|null)[]; nextExamAt: Date|null; stipendWindow: {startsAt; endsAt}|null; lessonsToday: Lesson[]; lessonsTomorrow: Lesson[]}`; `MAX_NUDGES = 3`; `computeNudges(ctx, now): Nudge[]`; `loadNudgeContext(v: StudentViewer, now): Promise<NudgeContext>`; `getNudges(v: StudentViewer, now): Promise<Nudge[]>`.
- `format.ts`: `ruDateKey(key: 'YYYY-MM-DD'): string` («20 ноября»); `ruDate(d: Date): string`; `ruRelativeDate(d: Date, now: Date): string` («сегодня»/«завтра»/«20 ноября»); `formatAverage(n: number): string` («4,8»).
- `grades.ts`: `listRequiredOpenCheckpoints(v: StudentViewer, semester: number)`.
- `deadlines.ts`: `DeadlineView` + `startsAt?: Date; appealTypeCode?: string`.

## Замечания
- Getnudges принимает `StudentViewer` (не общий `Viewer`): карточки только у студента.
- `prefill=1` в `/dekanat/new` должен обработать Task про мастер обращений/UI (здесь только ссылка).
