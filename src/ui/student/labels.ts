import type { ControlForm, ExamView, StudySummary } from "@/server/grades";
import type { Lesson, LessonChange } from "@/server/schedule";
import type { BadgeTone } from "../Badge";

// Подписи экранов студента: как называть вещи человеческими словами.

export const LESSON_TYPE_LABEL: Record<Lesson["type"], string> = {
  lecture: "Лекция",
  practice: "Практика",
  lab: "Лабораторная",
};

/** Бейджи изменений в расписании (спека §7.3); порядок — как в спеке. */
export const CHANGE_META: Record<LessonChange["kind"], { label: string; tone: BadgeTone }> = {
  moved: { label: "Перенос", tone: "warn" },
  cancelled: { label: "Отменена", tone: "danger" },
  teacher: { label: "Замена преподавателя", tone: "info" },
  room: { label: "Новая аудитория", tone: "accent" },
  extra: { label: "Доп. занятие", tone: "ok" },
};

export const CONTROL_FORM_LABEL: Record<ControlForm, string> = {
  exam: "Экзамен",
  credit: "Зачёт",
  graded_credit: "Дифференцированный зачёт",
};

export const EXAM_KIND_LABEL: Record<ExamView["kind"], string> = {
  exam: "Экзамен",
  credit: "Зачёт",
  retake: "Пересдача",
};

const GRADE_WORDS: Record<string, string> = {
  "5": "отлично",
  "4": "хорошо",
  "3": "удовлетворительно",
  "2": "неудовлетворительно",
};

/** «5, отлично»; «зачёт» и «незачёт» — как есть. */
export function gradeLabel(grade: string): string {
  return GRADE_WORDS[grade] ? `${grade}, ${GRADE_WORDS[grade]}` : grade;
}

export const isDebtGrade = (g: string | null) => g === "2" || g === "незачёт";

/** Сводка «Как у меня дела»: заголовок и пояснение человеческим языком. */
export const VERDICT_COPY: Record<StudySummary["verdict"], { title: string; text: string }> = {
  good: {
    title: "Всё идёт хорошо",
    text: "Долгов нет, обязательные контрольные точки сданы вовремя.",
  },
  risks: {
    title: "Есть риски",
    text: "Долгов нет, но скоро срок обязательной контрольной точки. Без неё не поставят допуск к сессии.",
  },
  debts: {
    title: "Есть долги",
    text: "Есть задолженность по прошлой сессии. Пока её не закрыть, академическую стипендию не назначат.",
  },
};
