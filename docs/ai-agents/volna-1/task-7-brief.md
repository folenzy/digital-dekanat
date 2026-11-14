### Task 7: «Деканат пишет первым»

**Files:**
- Create: `src/server/nudges.ts`
- Test: `tests/nudges.test.ts`

**Interfaces:**
- `computeNudges(ctx: NudgeContext, now: Date): Nudge[]` — чистая функция. `loadNudgeContext(v: StudentViewer, now): Promise<NudgeContext>`. `getNudges(v, now)` = load + compute.
- `Nudge = {id: string; kind: 'needs_info'|'cert_ready'|'debt'|'admission_risk'|'stipend_increased'|'schedule_change'; title: string; body: string; action: {label: string; href: string}}`. Максимум 3, порядок важности как в списке `kind`.
- Правила — по спеке §7.8. Повышенная стипендия: прошлая сессия без «удовлетворительно» и долгов, средний ≥ 4,5, `now` в окне приёма, нет обращения `stip_increased` в статусе кроме `rejected`. Действие: `/dekanat/new?type=stip_increased&prefill=1`. Риск недопуска: обязательная точка не сдана, срок ≤ 7 дней или прошёл, и до первого экзамена ≤ 45 дней. Расписание: изменение для группы на сегодня или завтра.

- [ ] **Step 1:** Тесты на `computeNudges` с ручными контекстами по каждому правилу и граничным условиям (средний 4,49 → нет; есть `stip_increased` в `submitted` → нет; окно закрыто → нет; больше 3 сработавших → 3 по приоритету). Интеграционно: у Алины в демо-мире есть `stipend_increased`, у Дениса — `needs_info`, `cert_ready` и `debt`.
- [ ] **Step 2:** Run → FAIL. Реализовать. Run → PASS. Commit `feat: деканат пишет первым`.

