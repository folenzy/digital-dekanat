import type { StudentViewer } from "./auth/viewer";
import { getMyAppeal, listMyAppeals } from "./appeals/service";
import type { AppealStatus } from "./appeals/types";
import { listUpcomingDeadlines } from "./deadlines";
import { formatAverage, ruDate, ruDateKey, ruRelativeDate } from "./format";
import { currentSemester, getStudySummary, type Debt, type Risk } from "./grades";
import { getDay, type Lesson } from "./schedule";
import { mskDateKey, mskMinutes, shiftDateKey } from "./time";

// «Деканат пишет первым»: карточки считаются правилами из данных студента, без нейросети (спека §7.8).
// Карточка исчезает сама, когда условие перестало выполняться; ручного «скрыть» нет.

export type NudgeKind =
  | "needs_info" | "cert_ready" | "debt" | "admission_risk" | "stipend_increased" | "schedule_change";

export type Nudge = {
  /** Стабильный и детерминированный: годится как React key. */
  id: string;
  kind: NudgeKind;
  title: string;
  body: string;
  action: { label: string; href: string };
};

export type NudgeAppeal = {
  id: string; number: string; typeCode: string; typeTitle: string; status: AppealStatus;
  pickup: { place: string; until: Date } | null;
};

export type NudgeContext = {
  /** Все обращения студента (активные и завершённые). */
  appeals: NudgeAppeal[];
  debts: Debt[];
  /** Обязательные точки текущего семестра, не сданные и со сроком ≤ 7 дней или просроченные. */
  risks: Risk[];
  avgLastSession: number | null;
  /** Итоговые оценки прошлой сессии ('5', '4', 'зачёт', …). */
  lastSessionGrades: (string | null)[];
  /** Ближайший будущий экзамен или зачёт группы (не пересдача). */
  nextExamAt: Date | null;
  /** Окно приёма заявлений на повышенную стипендию, если оно есть у аудитории студента. */
  stipendWindow: { startsAt: Date; endsAt: Date } | null;
  lessonsToday: Lesson[];
  lessonsTomorrow: Lesson[];
};

export const MAX_NUDGES = 3;
const STIPEND_MIN_AVERAGE = 4.5;
const RISK_EXAM_DAYS = 45;
const RISK_DUE_DAYS = 7;

/** Порядок важности. */
const KIND_ORDER: readonly NudgeKind[] = [
  "needs_info", "cert_ready", "debt", "admission_risk", "stipend_increased", "schedule_change",
];

const hhmm = (d: Date) => {
  const m = mskMinutes(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const dayDiff = (fromKey: string, toKey: string) =>
  Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);

function describeLesson(l: Lesson): string {
  const head = `${l.pair}-я пара, ${l.discipline}`;
  const c = l.change;
  if (l.cancelled || c?.kind === "cancelled") return `${head}: отменена.`;
  switch (c?.kind) {
    case "room": return `${head}: аудитория ${l.room}${c.was?.room ? ` вместо ${c.was.room}` : ""}.`;
    case "teacher": return `${head}: замена преподавателя, ${l.teacher}.`;
    case "moved": return `${head}: перенос на ${l.start}${c.was?.start ? ` (было в ${c.was.start})` : ""}.`;
    case "extra": return `${head}: дополнительное занятие в ${l.start}, ауд. ${l.room}.`;
    default: return `${head}: изменение.`;
  }
}

function stipendNudge(ctx: NudgeContext, now: Date): Nudge | null {
  const w = ctx.stipendWindow;
  if (!w || now < w.startsAt || now > w.endsAt) return null;
  if (ctx.avgLastSession === null || ctx.avgLastSession < STIPEND_MIN_AVERAGE) return null;
  if (ctx.debts.length > 0) return null;
  if (ctx.lastSessionGrades.some((g) => g === "3" || g === "2" || g === "незачёт")) return null;
  if (ctx.appeals.some((a) => a.typeCode === "stip_increased" && a.status !== "rejected")) return null;
  return {
    id: "stipend_increased", kind: "stipend_increased",
    title: "Ты проходишь на повышенную стипендию",
    body: `Средний балл за прошлую сессию ${formatAverage(ctx.avgLastSession)}, троек и долгов нет. `
      + `Заявления принимаем до ${ruDate(w.endsAt)}.`,
    action: { label: "Подать в 1 тап", href: "/dekanat/new?type=stip_increased&prefill=1" },
  };
}

/** Чистая функция: из контекста и `now` — не больше трёх карточек в порядке важности. */
export function computeNudges(ctx: NudgeContext, now: Date): Nudge[] {
  const today = mskDateKey(now);
  const out: Nudge[] = [];

  for (const a of ctx.appeals) {
    if (a.status === "needs_info") {
      out.push({
        id: `needs_info:${a.id}`, kind: "needs_info",
        title: `Ответь на вопрос по обращению ${a.number}`,
        body: `${a.typeTitle}: деканату нужно уточнение, пока ты не ответишь, работа стоит.`,
        action: { label: "Ответить", href: `/dekanat/${a.id}` },
      });
    }
  }

  for (const a of ctx.appeals) {
    if (a.status === "ready" && a.pickup) {
      out.push({
        id: `cert_ready:${a.id}`, kind: "cert_ready",
        title: `Справка готова, забери в ${a.pickup.place} до ${ruDate(a.pickup.until)}`,
        body: `${a.typeTitle}, обращение ${a.number}.`,
        action: { label: "Открыть обращение", href: `/dekanat/${a.id}` },
      });
    }
  }

  for (const d of ctx.debts) {
    const r = d.retake;
    out.push({
      id: `debt:${d.enrollmentId}`, kind: "debt",
      title: r
        ? `Пересдача по дисциплине «${d.discipline}»: ${ruRelativeDate(r.startsAt, now)} в ${hhmm(r.startsAt)}`
        : `Долг по дисциплине «${d.discipline}»`,
      body: r
        ? `Ауд. ${r.room}. Можно записаться или задать вопрос деканату.`
        : "Пересдача пока не назначена: спроси деканат, когда и как пересдать.",
      action: { label: r ? "Записаться / задать вопрос" : "Узнать про пересдачу", href: "/study?tab=session" },
    });
  }

  if (ctx.nextExamAt && dayDiff(today, mskDateKey(ctx.nextExamAt)) <= RISK_EXAM_DAYS) {
    for (const r of ctx.risks) {
      if (!r.overdue && r.daysLeft > RISK_DUE_DAYS) continue;
      out.push({
        id: `admission_risk:${r.checkpointId}`, kind: "admission_risk",
        title: "Риск недопуска к сессии",
        body: `Для допуска по ${r.discipline} не хватает «${r.title}», срок ${ruDateKey(r.dueDate)}`
          + `${r.overdue ? " (уже прошёл)" : ""}.`,
        action: { label: "Посмотреть", href: "/study" },
      });
    }
  }

  const stip = stipendNudge(ctx, now);
  if (stip) out.push(stip);

  for (const [key, lessons] of [[today, ctx.lessonsToday], [shiftDateKey(today, 1), ctx.lessonsTomorrow]] as const) {
    const changed = lessons.filter((l) => l.change || l.cancelled);
    if (!changed.length) continue;
    out.push({
      id: `schedule_change:${key}`, kind: "schedule_change",
      title: `Изменение в расписании ${key === today ? "сегодня" : "завтра"}`,
      body: changed.map(describeLesson).join(" "),
      action: { label: "Открыть расписание", href: "/schedule" },
    });
  }

  // Стабильная сортировка: порядок kind, внутри kind — как сложилось выше.
  return out
    .map((n, i) => ({ n, i }))
    .sort((a, b) => KIND_ORDER.indexOf(a.n.kind) - KIND_ORDER.indexOf(b.n.kind) || a.i - b.i)
    .slice(0, MAX_NUDGES)
    .map(({ n }) => n);
}

/** Собирает контекст через существующие функции чтения (studentId берётся из Viewer). */
export async function loadNudgeContext(v: StudentViewer, now: Date): Promise<NudgeContext> {
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const [study, active, done, deadlines, lessonsToday, lessonsTomorrow] = await Promise.all([
    getStudySummary(v, now),
    listMyAppeals(v, "active", now),
    listMyAppeals(v, "done", now),
    listUpcomingDeadlines(v, now),
    getDay(v, now),
    getDay(v, tomorrow),
  ]);

  const items = [...active, ...done];
  const pickups = new Map<string, NudgeAppeal["pickup"]>();
  await Promise.all(items.filter((a) => a.status === "ready").map(async (a) => {
    const detail = await getMyAppeal(v, a.id, now);
    pickups.set(a.id, detail?.pickup ?? null);
  }));

  const lastSemester = currentSemester(v.course, now) - 1;
  const window = deadlines.find((d) => d.kind === "deadline" && d.appealTypeCode === "stip_increased" && d.startsAt);
  const exam = study.session.find((e) => e.kind !== "retake" && +e.startsAt >= +now);

  return {
    appeals: items.map((a) => ({
      id: a.id, number: a.number, typeCode: a.type.code, typeTitle: a.type.title, status: a.status,
      pickup: pickups.get(a.id) ?? null,
    })),
    debts: study.debts,
    risks: study.risks,
    avgLastSession: study.avgLastSession,
    lastSessionGrades: study.history.find((h) => h.semester === lastSemester)?.entries.map((e) => e.finalGrade) ?? [],
    nextExamAt: exam?.startsAt ?? null,
    stipendWindow: window ? { startsAt: window.startsAt!, endsAt: window.due } : null,
    lessonsToday, lessonsTomorrow,
  };
}

export async function getNudges(v: StudentViewer, now: Date): Promise<Nudge[]> {
  return computeNudges(await loadNudgeContext(v, now), now);
}
