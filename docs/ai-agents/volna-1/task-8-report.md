# Task 8 report
Implemented src/server/kb.ts, tests/kb.test.ts; fixed SLA article; LLM_API_KEY= in .env.example.

Exports:
- `type KbHit = { id: number; question: string; answerExcerpt: string; answer: string; topic: string; appealTypeCode?: string }`
- `interface AnswerProvider { answer(q: string, hits: KbHit[]): Promise<string | null> }`
- `getAnswerProvider(): AnswerProvider | null` (always null in wave 1)
- `searchKb(query: string, limit = 3): Promise<KbHit[]>` (trim; <3 -> []; cut to 200; websearch_to_tsquery + ts_rank desc; fallback OR of plainto_tsquery per word (params, max 12 words); limit clamped 1..20)

TDD: RED = tests/kb.test.ts failed on missing module "@/server/kb"; first impl run had SQL syntax bug (`from t, (expr) as q`), fixed with `(select expr as q) t`; GREEN = 12/12 (`npx vitest run tests/kb.test.ts`).
Full: `npm test` 186/186 (3 runs); tsc clean; build OK. First full run had 1 failing test I could not identify (not reproduced in 3 reruns) - possible pre-existing flake.
KB fix: «Все справки делаем за 1 рабочий день: если ... до 17:00 ...» -> «Справки готовят за 1 рабочий день: ответ придёт до 18:00 следующего рабочего дня.» Other articles checked: sla 1/2/3 consistent.

## Fix round 1
Changes (src/server/kb.ts): fallback moved to `runFallback`: per article counts matched per-word plainto_tsquery terms (m) and content words (c, numnode>0; stop words excluded); requires m>0 and m >= 2 when c >= 3. Ranking by ts_rank over the OR query.
Tests added (tests/kb.test.ts): one real word + nonsense with >=3 content words («справка о погоде на марсе», «получить пиццу доставкой бесплатно») -> []; fallback-only query «хочу справку для военкомата срочно» -> cert_military first; tsquery syntax chars don't throw. 
Limitation: with exactly 2 content words one match still suffices (so «как получить пиццу» still returns articles); requiring 2 would break «когда платят стипендию» (платят does not stem-match выплат*). Reviewer's literal example «как получить пиццу» is therefore not covered; test uses 3-content-word variants.
Run: `npx vitest run tests/kb.test.ts` 15/15; `npm test` 189/189; tsc clean.
