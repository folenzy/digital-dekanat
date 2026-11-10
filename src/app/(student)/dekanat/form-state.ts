import type { Failure } from "@/server/appeals/result";
import { isTopic } from "@/ui/appeals/labels";

// Что видит студент, когда отправка не удалась: коды Result → русский текст. Без БД — и для клиента.

const GENERIC = "Не получилось отправить, попробуй ещё раз";

/** Состояние формы нового обращения для useActionState; null — ещё не отправляли. */
export type AppealFormState = {
  error: string;
  fieldErrors: Record<string, string>;
  /** Введённые строки — форма показывается снова с ними. */
  values: Record<string, string>;
} | null;

// Ошибки, которые не относятся к полю формы (тип, корень объекта), показываем общим текстом.
const NOT_A_FIELD = ["typeCode", "_form"];

export function appealFailureState(f: Failure, values: Record<string, string>): NonNullable<AppealFormState> {
  if (f.error === "rate_limited") {
    return { error: "Слишком много обращений за час — попробуй позже", fieldErrors: {}, values };
  }
  if (f.error === "validation" && f.fieldErrors) {
    const general = NOT_A_FIELD.map((k) => f.fieldErrors?.[k]).find(Boolean);
    return { error: general ?? "Проверь отмеченные поля", fieldErrors: f.fieldErrors, values };
  }
  return { error: GENERIC, fieldErrors: {}, values };
}

/** Состояние формы сообщения: sent растёт после каждой удачной отправки. */
export type MessageFormState = { ok: true; sent: number } | { ok: false; error: string; sent: number } | null;

export function messageFailureText(f: Failure): string {
  switch (f.error) {
    case "closed":
      return "Обращение закрыто — написать в него нельзя";
    case "rate_limited":
      return "Слишком много сообщений, попробуй через несколько минут";
    case "validation":
      return f.fieldErrors?.text ?? GENERIC;
    default:
      return GENERIC;
  }
}

/** «Не помогло — написать сотруднику»: мастер с выбранной темой и текстом вопроса. */
export function writeToStaffHref(topic: string | undefined, question: string): string {
  const q = new URLSearchParams();
  if (isTopic(topic)) q.set("topic", topic);
  q.set("text", question);
  return `/dekanat/new?${q.toString()}`;
}
