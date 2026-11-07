import { addWorkingDays, isOverdue } from "../time";
import { APPEAL_TYPES, type AppealStatus, type AppealTypeCode } from "./types";

// Срок ответа (SLA): N рабочих дней подтипа, до 18:00 МСК. Без БД — можно звать и на экране мастера.

/** Статусы, в которых срок идёт: деканат должен ответить. В needs_info ждём студента, срок стоит. */
export const SLA_RUNNING_STATUSES = ["submitted", "in_progress"] as const satisfies readonly AppealStatus[];

export function slaDueAt(slaDays: number, from: Date): Date {
  return addWorkingDays(from, slaDays);
}

/** Обещанный срок для подтипа, если отправить сейчас («ответ до …» перед отправкой). */
export function slaDueForType(code: AppealTypeCode, from: Date): Date {
  return slaDueAt(APPEAL_TYPES[code].slaDays, from);
}

export function isAppealOverdue(a: { status: AppealStatus; slaDueAt: Date }, now: Date): boolean {
  return (SLA_RUNNING_STATUSES as readonly AppealStatus[]).includes(a.status) && isOverdue(a.slaDueAt, now);
}
