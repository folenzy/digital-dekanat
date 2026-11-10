import type { z } from "zod";
import type { AppealStatus } from "./types";

// Ожидаемые отказы возвращаются значением, а не исключением; экран переводит код в текст.
export type AppealError = "not_found" | "bad_transition" | "rate_limited" | "validation" | "closed";
export type Failure = { ok: false; error: AppealError; fieldErrors?: Record<string, string> };
export type Result<T> = { ok: true; value: T } | Failure;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(error: AppealError, fieldErrors?: Record<string, string>): Failure {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** id обращения от клиента проверяется до запроса: кривой uuid → not_found, а не ошибка Postgres. */
export function isUuid(x: unknown): x is string {
  return typeof x === "string" && UUID_RE.test(x);
}

function chars(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "символ";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "символа";
  return "символов";
}

type Issue = z.ZodError["issues"][number];

function issueMessage(i: Issue): string {
  switch (i.code) {
    case "too_small":
      if (i.origin === "string") return Number(i.minimum) <= 1 ? "Заполни поле" : `Минимум ${i.minimum} ${chars(Number(i.minimum))}`;
      return `Не меньше ${i.minimum}`;
    case "too_big":
      if (i.origin === "string") return `Не больше ${i.maximum} ${chars(Number(i.maximum))}`;
      return `Не больше ${i.maximum}`;
    case "invalid_type":
      if (i.expected === "number" || i.expected === "int") return "Укажи число";
      if (i.expected === "date") return "Укажи дату";
      return "Заполни поле";
    case "invalid_value":
      return "Выбери один из вариантов";
    default:
      return "Проверь значение";
  }
}

/** Ошибка одного значения (текст сообщения, причина) под именем поля формы. */
export function fieldError(key: string, error: z.ZodError): Record<string, string> {
  return { [key]: issueMessage(error.issues[0]) };
}

/** Ошибки zod → `{ поле: текст по-русски }` (первая ошибка на поле; ошибка корня — под ключом `_form`). */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    out[key] ??= issueMessage(issue);
  }
  return out;
}

/** Результат действия над обращением (студента или сотрудника): новый статус. */
export type AppealActionResult = Result<{ status: AppealStatus }>;
