import "server-only";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import type { StudentViewer } from "./auth/viewer";
import { db } from "./db/client";
import { checkpoints, disciplines, enrollments, exams, rooms } from "./db/schema";
import { mskDateKey, shiftDateKey } from "./time";

export type ControlForm = "exam" | "credit" | "graded_credit";

export type CheckpointView = {
  id: number; title: string; maxPoints: number; score: number | null; dueDate: string; required: boolean;
};

export type EnrollmentView = {
  id: number; disciplineId: number; discipline: string; semester: number; controlForm: ControlForm;
  points: number | null; finalGrade: string | null; admitted: boolean | null;
  /**
   * Предварительная оценка «по темпу» — по доле баллов в уже оценённых контрольных точках (paceGrade).
   * Баллы из 100 в середине семестра оценку не показывают: «35 из 100» у отличницы — это 35 из 40 возможных.
   * null — оценок пока мало.
   */
  pace: Pace | null;
  checkpoints: CheckpointView[];
};

/** Предварительная оценка и на чём она основана: score из max оценённых баллов. */
export type Pace = { grade: string; score: number; max: number };

export type ExamView = {
  id: number; disciplineId: number; discipline: string; kind: "exam" | "credit" | "retake";
  startsAt: Date; room: string; building: string | null;
  /** Индивидуальная пересдача этого студента. */
  individual: boolean;
  /** Итог по дисциплине текущего семестра, если уже выставлен. */
  result: string | null;
};

export type Debt = {
  enrollmentId: number; discipline: string; semester: number; grade: string;
  /** Ближайшая назначенная пересдача студента по этой дисциплине. */
  retake: ExamView | null;
};

export type Risk = {
  enrollmentId: number; checkpointId: number; discipline: string; title: string;
  dueDate: string; overdue: boolean; daysLeft: number;
};

export type SemesterGrades = {
  semester: number; average: number | null;
  entries: { discipline: string; controlForm: ControlForm; points: number | null; finalGrade: string | null }[];
};

export type StudySummary = {
  verdict: "good" | "risks" | "debts";
  avgLastSession: number | null;
  debts: Debt[]; risks: Risk[];
  current: EnrollmentView[];
  /** Допуски к сессии по текущему семестру. */
  admission: { admitted: number; denied: number; pending: number };
  session: ExamView[];
  history: SemesterGrades[];
};

const RISK_DAYS = 7;
const DAY_MS = 86_400_000;

/** Сентябрь–январь — нечётный семестр курса, февраль–август — чётный. */
export function currentSemester(course: number, now: Date): number {
  const month = Number(mskDateKey(now).slice(5, 7));
  const autumn = month >= 9 || month === 1;
  return (course - 1) * 2 + (autumn ? 1 : 2);
}

/** Пороги баллов (из 100) для оценок «3», «4», «5»; зачёт — порог «3». Единый источник для всех шкал. */
export const GRADE_THRESHOLDS = { three: 55, four: 70, five: 85 } as const;

export function preliminaryGrade(points: number | null): string | null {
  if (points === null) return null;
  if (points >= GRADE_THRESHOLDS.five) return "отлично";
  if (points >= GRADE_THRESHOLDS.four) return "хорошо";
  if (points >= GRADE_THRESHOLDS.three) return "удовлетворительно";
  return "неудовлетворительно";
}

/** Отметка на полосе баллов: оценка и балл, с которого она ставится. */
export type GradeMark = { label: string; at: number };

/** Отметки по форме контроля: экзамен и дифзачёт — «3», «4», «5»; зачёт — одна отметка «зачёт». */
export function gradeMarks(form: ControlForm): GradeMark[] {
  if (form === "credit") return [{ label: "зачёт", at: GRADE_THRESHOLDS.three }];
  return [
    { label: "3", at: GRADE_THRESHOLDS.three },
    { label: "4", at: GRADE_THRESHOLDS.four },
    { label: "5", at: GRADE_THRESHOLDS.five },
  ];
}

export type GradeGoal = { kind: "need"; label: string; need: number } | { kind: "reached"; label: string };

/** Сколько баллов до ближайшей отметки выше текущих; все пройдены — reached с высшей. Ровно на пороге — порог пройден. */
export function gradeGoal(points: number | null, form: ControlForm): GradeGoal {
  const p = Math.min(100, Math.max(0, points ?? 0));
  const marks = gradeMarks(form);
  const next = marks.find((m) => p < m.at);
  return next ? { kind: "need", label: next.label, need: next.at - p } : { kind: "reached", label: marks[marks.length - 1].label };
}

export type NearestCheckpoint = { title: string; dueDate: string; maxPoints: number; overdue: boolean };

/** Ближайшая несданная (score === null) точка по сроку; overdue — срок уже прошёл. Все сданы — null. */
export function nearestCheckpoint(checkpoints: readonly CheckpointView[], today: string): NearestCheckpoint | null {
  const open = checkpoints.filter((c) => c.score === null).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const c = open[0];
  return c ? { title: c.title, dueDate: c.dueDate, maxPoints: c.maxPoints, overdue: c.dueDate < today } : null;
}

/** Сколько должно быть оценено, чтобы показывать предварительную оценку: 20 баллов или две точки. */
export const PACE_MIN_POINTS = 20;
export const PACE_MIN_CHECKPOINTS = 2;

/**
 * Предварительная оценка по уже оценённым контрольным точкам: доля набранных баллов → шкала preliminaryGrade.
 * Неоценённые точки не считаются. Если оценено меньше PACE_MIN_POINTS баллов и меньше PACE_MIN_CHECKPOINTS точек —
 * null («пока мало оценок»): одна точка на 5 баллов, сданная на 5, — ещё не «отлично».
 */
export function paceGrade(checkpoints: readonly Pick<CheckpointView, "score" | "maxPoints">[]): Pace | null {
  const graded = checkpoints.filter((c) => c.score !== null);
  const max = graded.reduce((sum, c) => sum + c.maxPoints, 0);
  const score = graded.reduce((sum, c) => sum + (c.score ?? 0), 0);
  if (max === 0 || (max < PACE_MIN_POINTS && graded.length < PACE_MIN_CHECKPOINTS)) return null;
  return { grade: preliminaryGrade(Math.round((score / max) * 100))!, score, max };
}

const isDebtGrade = (g: string | null) => g === "2" || g === "незачёт";

/** Средний балл: только числовые итоговые оценки; зачёт/незачёт не считаются. */
function average(grades: (string | null)[]): number | null {
  const nums = grades.filter((g): g is string => g !== null && /^[2-5]$/.test(g)).map(Number);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

/** Невыполненные обязательные контрольные точки студента в семестре (для дедлайнов и рисков). */
export async function listRequiredOpenCheckpoints(v: StudentViewer, semester: number) {
  return db
    .select({
      enrollmentId: enrollments.id, checkpointId: checkpoints.id, discipline: disciplines.name,
      title: checkpoints.title, dueDate: checkpoints.dueDate,
    })
    .from(checkpoints)
    .innerJoin(enrollments, eq(enrollments.id, checkpoints.enrollmentId))
    .innerJoin(disciplines, eq(disciplines.id, enrollments.disciplineId))
    .where(and(
      eq(enrollments.studentId, v.studentId), eq(enrollments.semester, semester),
      eq(checkpoints.required, true), isNull(checkpoints.score),
    ))
    .orderBy(asc(checkpoints.dueDate), asc(checkpoints.id));
}

export type AppealDiscipline = { id: number; name: string; debt: boolean };

/**
 * Дисциплины для обращения о пересдаче: сначала долги прошлых сессий, затем текущий семестр (по алфавиту).
 * Только записи самого студента — createAppeal проверяет disciplineId по ним же.
 */
export async function listAppealDisciplines(v: StudentViewer, now: Date): Promise<AppealDiscipline[]> {
  if (v?.role !== "student") return [];
  const semester = currentSemester(v.course, now);
  const rows = await db
    .select({ id: disciplines.id, name: disciplines.name, semester: enrollments.semester, grade: enrollments.finalGrade })
    .from(enrollments)
    .innerJoin(disciplines, eq(disciplines.id, enrollments.disciplineId))
    .where(and(eq(enrollments.studentId, v.studentId), lte(enrollments.semester, semester)))
    .orderBy(asc(disciplines.name), asc(enrollments.id));
  const debts = rows.filter((r) => r.semester < semester && isDebtGrade(r.grade));
  const current = rows.filter((r) => r.semester === semester);
  // одна строка на дисциплину; долг важнее (идёт первым)
  const out = new Map<number, AppealDiscipline>();
  for (const r of debts) if (!out.has(r.id)) out.set(r.id, { id: r.id, name: r.name, debt: true });
  for (const r of current) if (!out.has(r.id)) out.set(r.id, { id: r.id, name: r.name, debt: false });
  return [...out.values()];
}

async function listSession(v: StudentViewer, results: Map<number, string | null>): Promise<ExamView[]> {
  const rows = await db
    .select({
      id: exams.id, disciplineId: exams.disciplineId, discipline: disciplines.name, kind: exams.kind,
      startsAt: exams.startsAt, room: rooms.name, building: rooms.building, studentId: exams.studentId,
    })
    .from(exams)
    .innerJoin(disciplines, eq(disciplines.id, exams.disciplineId))
    .innerJoin(rooms, eq(rooms.id, exams.roomId))
    .where(or(
      and(eq(exams.groupId, v.groupId), isNull(exams.studentId)),
      eq(exams.studentId, v.studentId),
    ))
    .orderBy(asc(exams.startsAt), asc(exams.id));
  return rows.map((r) => ({
    id: r.id, disciplineId: r.disciplineId, discipline: r.discipline, kind: r.kind as ExamView["kind"],
    startsAt: r.startsAt, room: r.room, building: r.building, individual: r.studentId !== null,
    result: r.kind === "retake" ? null : (results.get(r.disciplineId) ?? null),
  }));
}

export async function getStudySummary(v: StudentViewer, now: Date): Promise<StudySummary> {
  const semester = currentSemester(v.course, now);
  const today = mskDateKey(now);

  const rows = await db
    .select({
      id: enrollments.id, disciplineId: enrollments.disciplineId, discipline: disciplines.name,
      semester: enrollments.semester, controlForm: enrollments.controlForm, points: enrollments.points,
      finalGrade: enrollments.finalGrade, admitted: enrollments.admitted,
    })
    .from(enrollments)
    .innerJoin(disciplines, eq(disciplines.id, enrollments.disciplineId))
    .where(and(eq(enrollments.studentId, v.studentId), lte(enrollments.semester, semester)))
    .orderBy(asc(disciplines.name), asc(enrollments.id));

  const currentRows = rows.filter((r) => r.semester === semester);
  const pastRows = rows.filter((r) => r.semester < semester);

  const cps = currentRows.length
    ? await db.select().from(checkpoints)
      .where(inArray(checkpoints.enrollmentId, currentRows.map((r) => r.id)))
      .orderBy(asc(checkpoints.dueDate), asc(checkpoints.id))
    : [];

  const current: EnrollmentView[] = currentRows.map((r) => {
    const own = cps.filter((c) => c.enrollmentId === r.id).map((c) => ({
      id: c.id, title: c.title, maxPoints: c.maxPoints, score: c.score, dueDate: c.dueDate, required: c.required,
    }));
    return { ...r, pace: paceGrade(own), checkpoints: own };
  });

  const session = await listSession(v, new Map(currentRows.map((r) => [r.disciplineId, r.finalGrade])));

  const debts: Debt[] = pastRows
    .filter((r) => isDebtGrade(r.finalGrade))
    .map((r) => ({
      enrollmentId: r.id, discipline: r.discipline, semester: r.semester, grade: r.finalGrade!,
      retake: session.find((e) => e.individual && e.kind === "retake" && e.disciplineId === r.disciplineId
        && +e.startsAt >= +now) ?? null,
    }));

  const limit = shiftDateKey(today, RISK_DAYS);
  const risks: Risk[] = (await listRequiredOpenCheckpoints(v, semester))
    .filter((c) => c.dueDate <= limit)
    .map((c) => ({
      enrollmentId: c.enrollmentId, checkpointId: c.checkpointId, discipline: c.discipline, title: c.title,
      dueDate: c.dueDate, overdue: c.dueDate < today,
      daysLeft: Math.round((Date.parse(`${c.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS),
    }));

  const bySemester = new Map<number, typeof pastRows>();
  for (const r of pastRows) bySemester.set(r.semester, [...(bySemester.get(r.semester) ?? []), r]);
  const history: SemesterGrades[] = [...bySemester.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sem, list]) => ({
      semester: sem, average: average(list.map((r) => r.finalGrade)),
      entries: list.map((r) => ({
        discipline: r.discipline, controlForm: r.controlForm, points: r.points, finalGrade: r.finalGrade,
      })),
    }));

  return {
    verdict: debts.length ? "debts" : risks.length ? "risks" : "good",
    avgLastSession: average(pastRows.filter((r) => r.semester === semester - 1).map((r) => r.finalGrade)),
    debts, risks, current,
    admission: {
      admitted: currentRows.filter((r) => r.admitted === true).length,
      denied: currentRows.filter((r) => r.admitted === false).length,
      pending: currentRows.filter((r) => r.admitted === null).length,
    },
    session, history,
  };
}
