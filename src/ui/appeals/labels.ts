import type { AppealDetail, AppealEventKind, AppealKind, AppealTopic } from "@/server/appeals/types";
import { plural } from "@/server/format";

// Подписи обращений человеческими словами: темы, поля, события таймлайна. Общие для студента и сотрудника.

export const TOPIC_META: Record<AppealTopic, { title: string; text: string }> = {
  certificates: {
    title: "Справки",
    text: "Об обучении, для военкомата и соцзащиты, выписка оценок. Готовим за рабочий день.",
  },
  study: {
    title: "Учебные вопросы",
    text: "Пересдача, индивидуальный график, перевод, академический отпуск.",
  },
  stipend: {
    title: "Стипендия",
    text: "Повышенная и социальная стипендия, материальная помощь, вопросы по выплатам.",
  },
};

export const TOPICS = Object.keys(TOPIC_META) as AppealTopic[];

export function isTopic(x: unknown): x is AppealTopic {
  return typeof x === "string" && Object.hasOwn(TOPIC_META, x);
}

/** «обычно отвечаем за 2 раб. дня» — срок подтипа в рабочих днях. */
export function slaPhrase(days: number): string {
  return `обычно отвечаем за ${days} раб. ${plural(days, ["день", "дня", "дней"])}`;
}

/** Подпись поля с текстом: заявление или вопрос. */
export function textLabel(kind: AppealKind): string {
  return kind === "question" ? "Твой вопрос" : "Текст заявления";
}

export const FORMAT_LABEL: Record<string, string> = {
  paper: "На бумаге, с печатью",
  electronic: "Электронная, PDF с подписью",
};

/**
 * Как называть человека в таймлайне и переписке: «Ирина Белова», «Алина Миронова».
 * Сервер отдаёт сотрудника «Имя Отчество Фамилия», студента — «Фамилия Имя Отчество».
 */
export function personShortName(fullName: string, role: "student" | "staff"): string {
  const w = fullName.trim().split(/\s+/);
  if (w.length < 2) return w[0] ?? "";
  return role === "staff" ? `${w[0]} ${w[w.length - 1]}` : `${w[1]} ${w[0]}`;
}

export const EVENT_LABEL: Record<AppealEventKind, string> = {
  submitted: "Отправлено",
  taken: "Принято в работу",
  replied: "Деканат ответил",
  needs_info: "Нужно уточнение",
  answered: "Ответ на уточнение",
  ready: "Готово",
  rejected: "Отклонено",
  closed: "Закрыто",
};

const CERT_FIELDS: [key: string, label: string][] = [
  ["destination", "Куда нужна справка"],
  ["copies", "Экземпляров"],
  ["format", "Формат"],
  ["comment", "Комментарий"],
];

type FieldsSource = Pick<AppealDetail, "fields" | "disciplineName"> & { type: { kind: AppealKind } };

/** Поля обращения для карточки: только известные, в понятном порядке, текст — как ввёл автор. */
export function fieldRows(a: FieldsSource): { label: string; value: string }[] {
  const f = a.fields;
  const rows: { label: string; value: string }[] = [];
  if (a.type.kind === "certificate") {
    for (const [key, label] of CERT_FIELDS) {
      const v = f[key];
      if (typeof v !== "string" && typeof v !== "number") continue;
      if (typeof v === "string" && !v.trim()) continue;
      rows.push({ label, value: key === "format" ? (FORMAT_LABEL[String(v)] ?? String(v)) : String(v) });
    }
    return rows;
  }
  if (a.disciplineName) rows.push({ label: "Дисциплина", value: a.disciplineName });
  if (typeof f.text === "string") rows.push({ label: textLabel(a.type.kind), value: f.text });
  return rows;
}
