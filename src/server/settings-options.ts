// Справочники настроек профиля. Только данные и чистые функции (без БД): их читают и сервер, и формы.

/** Иностранный язык обучения. */
export const STUDY_LANGUAGES = [
  { code: "en", label: "Английский" },
  { code: "de", label: "Немецкий" },
  { code: "fr", label: "Французский" },
  { code: "zh", label: "Китайский" },
] as const;
export type StudyLanguage = (typeof STUDY_LANGUAGES)[number]["code"];

export function languageLabel(code: string | null | undefined): string | null {
  return STUDY_LANGUAGES.find((l) => l.code === code)?.label ?? null;
}

/**
 * Категории уведомлений, которые можно выключить. Ответы деканата по обращениям в список не входят:
 * их выключить нельзя — иначе кабинет перестаёт решать свою главную задачу.
 */
export const NOTIFY_CATEGORIES = [
  {
    code: "schedule", label: "Изменения в расписании",
    hint: "Переносы, отмены, замены преподавателя и аудитории",
    kinds: ["schedule_change"],
  },
  {
    code: "deadlines", label: "Сроки и дедлайны",
    hint: "Контрольные точки, приём заявлений, запись на дисциплины",
    kinds: ["deadline"],
  },
  {
    code: "announcements", label: "Объявления деканата",
    hint: "Новости для факультета, курса или группы. Сами объявления остаются во вкладке «Объявления»",
    kinds: ["announcement"],
  },
] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]["code"];

const CATEGORY_CODES = new Set<string>(NOTIFY_CATEGORIES.map((c) => c.code));

/** Из того, что лежит в БД или пришло из формы, — только известные категории, без повторов, в порядке списка. */
export function cleanMuted(raw: unknown): NotifyCategory[] {
  if (!Array.isArray(raw)) return [];
  const asked = new Set(raw.filter((x): x is string => typeof x === "string" && CATEGORY_CODES.has(x)));
  return NOTIFY_CATEGORIES.map((c) => c.code).filter((c) => asked.has(c));
}

/** Виды уведомлений (notifications.kind), скрытые при таких настройках. */
export function mutedKinds(muted: readonly string[]): string[] {
  return NOTIFY_CATEGORIES.filter((c) => muted.includes(c.code)).flatMap((c) => [...c.kinds]);
}
