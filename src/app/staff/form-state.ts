import type { Failure } from "@/server/appeals/result";
import { mskAt, mskDateKey, shiftDateKey } from "@/server/time";
import { PICKUP_HOUR, PICKUP_MAX_DAYS } from "@/ui/staff/labels";

// Что видит сотрудник, когда действие не удалось: коды Result → русский текст; разбор полей форм.
// Без БД — и для клиента.

const GENERIC = "Не получилось сохранить, попробуй ещё раз";

/** Состояние формы действия над обращением для useActionState; seq растёт с каждой отправкой. */
export type StaffActionState =
  | { ok: true; seq: number }
  | { ok: false; error: string; fieldErrors: Record<string, string>; seq: number }
  | null;

/** Ошибка действия: общий текст (пустой, если всё сказано у полей) и ошибки полей. */
export function staffFailure(f: Failure): { error: string; fieldErrors: Record<string, string> } {
  switch (f.error) {
    case "bad_transition":
      return { error: "Статус уже изменился — обнови страницу", fieldErrors: {} };
    case "closed":
      return { error: "Обращение закрыто — написать в него нельзя", fieldErrors: {} };
    case "rate_limited":
      return { error: "Слишком много сообщений — попробуй через несколько минут", fieldErrors: {} };
    case "not_found":
      return { error: "Обращение не найдено — вернись в очередь и открой его заново", fieldErrors: {} };
    case "empty":
      return { error: "Новых обращений нет — всё разобрано", fieldErrors: {} };
    case "validation":
      if (f.fieldErrors && Object.keys(f.fieldErrors).length > 0) {
        return { error: f.fieldErrors._form ?? "", fieldErrors: f.fieldErrors };
      }
      return { error: GENERIC, fieldErrors: {} };
    default:
      return { error: GENERIC, fieldErrors: {} };
  }
}

/** Срок выдачи справки из поля даты (ГГГГ-ММ-ДД) → 17:00 МСК этого дня; не дальше чем через 90 дней. */
export function parsePickupUntil(key: string, now: Date): { until: Date } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { error: "Укажи дату" };
  const day = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(day) || new Date(day).toISOString().slice(0, 10) !== key) return { error: "Укажи дату" };
  if (key > shiftDateKey(mskDateKey(now), PICKUP_MAX_DAYS)) {
    return { error: `Срок выдачи — не дальше чем через ${PICKUP_MAX_DAYS} дней` };
  }
  return { until: mskAt(key, PICKUP_HOUR) };
}

export type AudienceInput = { facultyId?: number; course?: number; groupId?: number };

const AUDIENCE_KINDS = ["all", "faculty", "course", "group"] as const;
type AudienceKind = (typeof AUDIENCE_KINDS)[number];

const int = (form: FormData, key: string): number | undefined => {
  const v = form.get(key);
  return typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : undefined;
};

/** Аудитория объявления: берётся только выбранное измерение; не выбрано значение — ошибка у своего поля. */
export function audienceFromForm(form: FormData): { audience: AudienceInput } | { fieldErrors: Record<string, string> } {
  const kind = form.get("audience");
  if (typeof kind !== "string" || !(AUDIENCE_KINDS as readonly string[]).includes(kind)) {
    return { fieldErrors: { audience: "Выбери, кому адресовано объявление" } };
  }
  switch (kind as AudienceKind) {
    case "all":
      return { audience: {} };
    case "faculty": {
      const facultyId = int(form, "facultyId");
      return facultyId ? { audience: { facultyId } } : { fieldErrors: { "audience.facultyId": "Выбери факультет" } };
    }
    case "course": {
      const course = int(form, "course");
      return course && course >= 1 && course <= 6
        ? { audience: { course } } : { fieldErrors: { "audience.course": "Выбери курс" } };
    }
    case "group": {
      const groupId = int(form, "groupId");
      return groupId ? { audience: { groupId } } : { fieldErrors: { "audience.groupId": "Выбери группу" } };
    }
  }
}

/** Состояние формы объявления; values — введённое, чтобы показать форму снова после ошибки. */
export type AnnouncementFormState =
  | { ok: true; recipients: number; seq: number }
  | { ok: false; error: string; fieldErrors: Record<string, string>; values: Record<string, string>; seq: number }
  | null;

export function announcementFailureState(
  f: Failure, values: Record<string, string>, seq = 0,
): Extract<AnnouncementFormState, { ok: false }> {
  if (f.error === "rate_limited") {
    return { ok: false, error: "Слишком много объявлений за час — попробуй позже", fieldErrors: {}, values, seq };
  }
  if (f.error === "validation" && f.fieldErrors) {
    return { ok: false, error: "Проверь отмеченные поля", fieldErrors: f.fieldErrors, values, seq };
  }
  return { ok: false, error: GENERIC, fieldErrors: {}, values, seq };
}
