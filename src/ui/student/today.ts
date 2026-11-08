import type { AppealListItem } from "@/server/appeals/types";
import { mskTime, plural, prettyTime, ruDateKey, ruRelativeDate, ruWeekday } from "@/server/format";
import type { Lesson } from "@/server/schedule";
import { mskDateKey, mskMinutes, shiftDateKey } from "@/server/time";

// Тексты экрана «Сегодня»: одна-две фразы, которые отвечают «что у меня сейчас и что ждёт ответа».

type NextLesson = Lesson & { dateKey: string };

const PAIRS: readonly [string, string, string] = ["пара", "пары", "пар"];
const PAIR_WORDS = ["", "одна", "две", "три", "четыре", "пять", "шесть"];
const BY_N = ["", "одному обращению", "двум обращениям", "трём обращениям"];

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** «завтра, 2-я пара в 10:40» или «понедельник, 16 ноября, 2-я пара в 10:40». */
export function nextLessonPhrase(next: NextLesson, now: Date): string {
  const today = mskDateKey(now);
  const day = next.dateKey === today
    ? "сегодня"
    : next.dateKey === shiftDateKey(today, 1)
      ? "завтра"
      : `${ruWeekday(next.dateKey)}, ${ruDateKey(next.dateKey)}`;
  return `${day}, ${next.pair}-я пара в ${prettyTime(next.start)}`;
}

function lessonsSentence(
  lessons: Lesson[], current: Lesson | undefined, next: NextLesson | undefined, now: Date,
): string | null {
  const active = lessons.filter((l) => !l.cancelled);
  const today = mskDateKey(now);
  const following = next ? ` Следующая — ${nextLessonPhrase(next, now)}.` : "";
  // В день без пар об этом говорит блок «Пары сегодня» — сводка не повторяет.
  if (!active.length) return null;

  if (current) return `Сейчас идёт ${current.pair}-я пара, закончится в ${prettyTime(current.end)}.`;

  const t = mskMinutes(now);
  const first = active[0];
  if (t < toMin(first.start)) {
    const n = active.length;
    const count = `${PAIR_WORDS[n] ?? n} ${plural(n, PAIRS)}`;
    return n === 1
      ? `Сегодня одна пара, в ${prettyTime(first.start)}.`
      : `Сегодня ${count}, первая в ${prettyTime(first.start)}.`;
  }
  if (next && next.dateKey === today) {
    return `Следующая пара в ${prettyTime(next.start)}, ауд. ${next.room}.`;
  }
  return `Пары на сегодня закончились.${following}`;
}

function appealsSentence(appeals: AppealListItem[], now: Date): string | null {
  const waiting = appeals.filter((a) => a.status === "needs_info").length;
  if (waiting) {
    return `По ${BY_N[waiting] ?? `${waiting} обращениям`} деканат ждёт твоего ответа.`;
  }
  const ready = appeals.filter((a) => a.status === "ready");
  if (ready.length === 1) {
    return ready[0].type.kind === "certificate"
      ? "Справка готова, её можно забрать."
      : "Обращение готово, посмотри результат.";
  }
  if (ready.length > 1) return `Готово обращений: ${ready.length}, посмотри результат.`;
  const running = appeals.filter((a) => a.status === "submitted" || a.status === "in_progress");
  if (running.length === 1) {
    const a = running[0];
    return a.overdue
      ? "Ответ по обращению задерживается: обещанный срок прошёл."
      : `Обращение в работе, ответ ${ruRelativeDate(a.slaDueAt, now)} до ${mskTime(a.slaDueAt)}.`;
  }
  if (running.length > 1) return `Обращений в работе: ${running.length}.`;
  return null;
}

/** Сводка под приветствием: про пары и про обращения. */
export function todaySummary(
  input: { lessons: Lesson[]; current?: Lesson; next?: NextLesson; appeals: AppealListItem[] }, now: Date,
): string {
  const parts = [lessonsSentence(input.lessons, input.current, input.next, now), appealsSentence(input.appeals, now)]
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "Срочных дел нет.";
}

export type AppealPromise = { text: string; tone: "muted" | "danger" | "warn" | "ok" };

/** Что обещано по обращению: срок ответа, просрочка, ждём тебя или готово. */
export function appealPromise(a: AppealListItem, now: Date): AppealPromise {
  switch (a.status) {
    case "needs_info":
      return { text: "Деканат ждёт твоего ответа", tone: "warn" };
    case "ready":
      return { text: "Готово, загляни в обращение", tone: "ok" };
    case "rejected":
      return { text: "Отклонено, причина в обращении", tone: "danger" };
    case "closed":
      return { text: "Закрыто", tone: "muted" };
    default: {
      const when = `${ruRelativeDate(a.slaDueAt, now)} до ${mskTime(a.slaDueAt)}`;
      return a.overdue
        ? { text: `Срок ответа прошёл: обещали ${relativePast(a.slaDueAt, now)} до ${mskTime(a.slaDueAt)}`, tone: "danger" }
        : { text: `Ответ ${when}`, tone: "muted" };
    }
  }
}

/** «вчера» для прошедшей даты, иначе «9 ноября». */
function relativePast(d: Date, now: Date): string {
  const key = mskDateKey(d);
  if (key === mskDateKey(now)) return "сегодня";
  if (key === shiftDateKey(mskDateKey(now), -1)) return "вчера";
  return ruDateKey(key);
}
