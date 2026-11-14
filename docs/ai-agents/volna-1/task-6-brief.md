### Task 6: Обращения — студент и сотрудник, SLA, события, лимиты

**Files:**
- Create: `src/server/appeals/types.ts`, `sla.ts`, `service.ts`, `staff.ts`, `src/server/limits.ts`
- Test: `tests/appeals/*.test.ts`, расширить `tests/idor.test.ts`

**Interfaces:**
- `APPEAL_TYPES` (код → {topic: 'certificates'|'study'|'stipend'; kind; department: 'docs'|'study'|'stipend'; title; hint; slaDays; fields: zod-схема}):
  - certificates (kind `certificate`, dept `docs`, SLA 1): `cert_study` «Справка об обучении», `cert_military` «Справка для военкомата», `cert_social` «Справка для соцзащиты», `cert_benefit` «Справка для стипендии или пособия», `cert_grades` «Архивная справка (выписка оценок)». Поля: `destination` (1–120), `copies` (1–5), `format` (`paper`|`electronic`), `comment?` (≤500).
  - study (dept `study`, SLA 2): `study_retake` (application) «Пересдача», `study_individual_plan` (application) «Индивидуальный график», `study_transfer` (application) «Перевод», `study_academic_leave` (application) «Академический отпуск», `study_other` (question) «Другой учебный вопрос». Поля: `text` (10–2000), `disciplineId?` (только дисциплины студента).
  - stipend (dept `stipend`, SLA 3): `stip_increased` (application) «Повышенная академическая стипендия», `stip_social` (application) «Социальная стипендия», `stip_material_aid` (application) «Материальная помощь», `stip_payment_question` (question) «Вопрос по выплате». Поля: `text` (10–2000).
- Студент (`service.ts`): `createAppeal(v, typeCode, fields, now)` → `{id, number}`. Валидация zod; `sla_due_at = addWorkingDays(now, slaDays)`; событие `submitted`; уведомления сотрудникам отдела; realtime (Task 9 даёт `publish`, до него — заглушка-интерфейс). Идемпотентность: тот же студент, тип и `fields` в течение 10 с → вернуть существующее. Лимит 10 обращений в час (`limits.ts` через `action_log`) → ошибка `'rate_limited'`.
  `listMyAppeals(v, filter: 'active'|'done')`, `getMyAppeal(v, id): Promise<AppealDetail | null>` (`where id = ? and student_id = v.studentId`), `postStudentMessage(v, id, text)` (1–2000; если статус `needs_info` → перевод в `in_progress`, новый `sla_due_at = addWorkingDays(now, slaDays)`, событие), `confirmReceived(v, id)` (`ready` → `closed`).
- Сотрудник (`staff.ts`): `listQueue(v: StaffViewer, tab: 'new'|'in_progress'|'waiting'|'closed', departmentId?)` (только отделы `v.departmentIds`, сортировка по `sla_due_at`), `getQueueAppeal(v, id)` (студент: только ФИО, факультет, группа, курс), `takeAppeal`, `replyAppeal(v, id, text)`, `requestInfo(v, id, question)`, `markReady(v, id, pickup: {place: string; until: Date} | null)`, `rejectAppeal(v, id, reason)` (причина 5–500), `getStaffSummary(v, now)` → `{new; inProgress; overdue; avgFirstResponseHoursWeek}`.
- Переходы статусов (всё остальное → ошибка `'bad_transition'`): `submitted→in_progress` (take), `submitted|in_progress→rejected`, `in_progress→needs_info`, `needs_info→in_progress` (ответ студента), `in_progress→ready`, `ready→closed`. Сообщения нельзя писать в `rejected|closed`.
- Каждое действие → `appeal_events` (кто, что, когда, текст) + уведомление студенту («Обращение О-… принято в работу», «Деканат ответил…», «Нужно уточнение…», «Справка готова…», «Обращение отклонено…»).
- Лимиты: сообщения 30/час на пользователя.

- [ ] **Step 1:** Тесты: `cert_military` уходит в отдел `docs`, `sla_due_at` = `addWorkingDays(now,1)`; двойная отправка за 10 с → один `id`; 11-е обращение за час → `rate_limited`; `<script>alert(1)</script>` сохраняется дословно в `fields.text` (экранирование — задача рендера, проверяется в e2e); `requestInfo` → студент отвечает → статус `in_progress` и новый срок; `markReady` на `submitted` → `bad_transition`.
- [ ] **Step 2 (IDOR, расширить `idor.test.ts`):** `getMyAppeal(alina, idОбращенияДениса) === null`; `postStudentMessage(alina, idДениса, …)` → ошибка `not_found`, сообщение не создано; `confirmReceived(alina, idДениса)` → `not_found`. Сотрудник без членства в отделе (создать в тесте) не видит обращение этого отдела в `listQueue` и `getQueueAppeal` → `null`.
- [ ] **Step 3:** Run → FAIL. Реализовать. Run → PASS. Commit `feat(appeals): обращения, маршрутизация, SLA, действия сотрудника`.

