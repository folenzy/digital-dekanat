import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "./db/client";

// Поиск по базе ответов деканата (PostgreSQL full-text, конфигурация 'russian').

export type KbHit = {
  id: number;
  question: string;
  /** Начало ответа (~160 символов по границе слова, с «…»). */
  answerExcerpt: string;
  answer: string;
  topic: string;
  appealTypeCode?: string;
};

/**
 * Точка расширения под нейросеть: получает вопрос и найденные статьи, возвращает текст или null.
 * В волне 1 не подключена: ассистент отвечает только по базе знаний.
 */
export interface AnswerProvider {
  answer(q: string, hits: KbHit[]): Promise<string | null>;
}

/**
 * Провайдер нейросети намеренно не подключён в волне 1, всегда null.
 * Когда он появится, ключ LLM_API_KEY читается только на сервере и не попадает в клиентский код.
 */
export function getAnswerProvider(): AnswerProvider | null {
  return null;
}

const MIN_QUERY = 3;
const MAX_QUERY = 200;
const MAX_WORDS = 12;
const EXCERPT_LEN = 160;

function excerpt(answer: string): string {
  if (answer.length <= EXCERPT_LEN) return answer;
  const cut = answer.slice(0, EXCERPT_LEN);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > EXCERPT_LEN / 2 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,.;:–—-]+$/u, "") + "…";
}

type Row = {
  id: number; question: string; answer: string; topic: string; appeal_type_code: string | null;
};

async function run(tsquery: SQL, limit: number): Promise<Row[]> {
  return (await db.execute(sql`
    select id, question, answer, topic, appeal_type_code
    from kb_articles, (select ${tsquery} as q) t
    where search @@ t.q
    order by ts_rank(search, t.q) desc, id asc
    limit ${limit}`)) as unknown as Row[];
}

// Запасной поиск: статья подходит, если совпало достаточно значимых слов запроса.
// Стоп-слова («как», «на») дают пустой tsquery и не считаются значимыми.
// При 3 и более значимых словах нужно совпадение минимум двух, иначе одно общее слово
// («справка», «получить») вытаскивало бы статьи на запрос вроде «как получить пиццу».
async function runFallback(words: string[], limit: number): Promise<Row[]> {
  const tq = words.map((w) => sql`plainto_tsquery('russian', ${w})`);
  const matched = sql.join(tq.map((x) => sql`(search @@ ${x})::int`), sql` + `);
  const content = sql.join(tq.map((x) => sql`(numnode(${x}) > 0)::int`), sql` + `);
  const anyQuery = sql`(${sql.join(tq, sql` || `)})`;
  return (await db.execute(sql`
    select id, question, answer, topic, appeal_type_code from (
      select id, question, answer, topic, appeal_type_code,
             ${matched} as m, ${content} as c, ts_rank(search, ${anyQuery}) as r
      from kb_articles
    ) x
    where m > 0 and m >= case when c >= 3 then 2 else 1 end
    order by r desc, id asc
    limit ${limit}`)) as unknown as Row[];
}

export async function searchKb(query: string, limit = 3): Promise<KbHit[]> {
  const q = query.trim().slice(0, MAX_QUERY).trim();
  if (q.length < MIN_QUERY) return [];
  const lim = Math.max(1, Math.min(Math.trunc(limit) || 3, 20));

  let rows = await run(sql`websearch_to_tsquery('russian', ${q})`, lim);

  if (rows.length === 0) {
    // Запасной вариант для естественных вопросов: ИЛИ по отдельным словам.
    // Каждое слово идёт параметром в plainto_tsquery, синтаксис tsquery из ввода не собирается.
    const words = [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, MAX_WORDS);
    if (words.length > 0) {
      rows = await runFallback(words, lim);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    answerExcerpt: excerpt(r.answer),
    answer: r.answer,
    topic: r.topic,
    ...(r.appeal_type_code ? { appealTypeCode: r.appeal_type_code } : {}),
  }));
}
