### Task 8: «Спроси деканат» — поиск по базе ответов

**Files:**
- Create: `src/server/kb.ts`
- Test: `tests/kb.test.ts`

**Interfaces:**
- `searchKb(query: string, limit = 3): Promise<KbHit[]>`, `KbHit = {id; question; answerExcerpt; answer; topic; appealTypeCode?}`. `websearch_to_tsquery('russian', q)` + `ts_rank`; запрос короче 3 символов → `[]`; длиннее 200 → обрезать.
- Точка расширения на нейросеть: `interface AnswerProvider { answer(q: string, hits: KbHit[]): Promise<string|null> }`, по умолчанию `null` (выключено). Ключ только из env `LLM_API_KEY`. В волне 1 не используется.

- [ ] **Step 1:** Тесты: «справка в военкомат» → первый результат со ссылкой на `cert_military`; «повышенная стипендия» → `stip_increased`; «пересдать экзамен» → `study_retake`; «абырвалг» → `[]`; `"'; drop table users; --"` → `[]` и таблица на месте.
- [ ] **Step 2:** Run → FAIL. Реализовать (статьи уже засеяны в Task 3). Run → PASS. Commit `feat: поиск по базе ответов деканата`.

