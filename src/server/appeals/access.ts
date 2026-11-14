import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { StaffViewer, StudentViewer } from "../auth/viewer";
import { db } from "../db/client";
import { appealEvents, appeals, appealTypes, students } from "../db/schema";
import { releaseAction, reserveAction, type LimitSpec } from "../limits";
import {
  departmentStaffUserIds, insertNotifications, publishSafe, staffHref, studentHref, type Notice,
} from "./notify";
import { fail, ok, type Failure, type Result } from "./result";
import type { AppealEventKind, AppealKind, AppealStatus } from "./types";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Кто какое обращение видит — всегда условие в самом SQL-запросе. Чужое и несуществующее неотличимы.

/** Студент: только свои обращения (studentId из Viewer, не от клиента). */
export function studentScope(v: StudentViewer): SQL {
  return v?.role === "student" && Number.isInteger(v.studentId) ? eq(appeals.studentId, v.studentId) : sql`false`;
}

/** Сотрудник: только обращения отделов, в которых он состоит. */
export function staffScope(v: StaffViewer): SQL {
  const ids = v?.role === "staff" && Array.isArray(v.departmentIds) ? v.departmentIds.filter(Number.isInteger) : [];
  return ids.length > 0 ? inArray(appeals.departmentId, ids) : sql`false`;
}

/** Строка обращения под блокировкой FOR UPDATE: параллельные действия над одним обращением идут по очереди. */
export type LockedAppeal = {
  id: string; number: string; status: AppealStatus; kind: AppealKind; typeTitle: string; slaDays: number;
  slaDueAt: Date; departmentId: number; studentUserId: string;
  assigneeStaffId: number | null; firstResponseAt: Date | null;
};

const lockedColumns = {
  id: appeals.id, number: appeals.number, status: appeals.status, kind: appealTypes.kind,
  typeTitle: appealTypes.title, slaDays: appealTypes.slaDays, slaDueAt: appeals.slaDueAt,
  departmentId: appeals.departmentId, studentUserId: students.userId,
  assigneeStaffId: appeals.assigneeStaffId, firstResponseAt: appeals.firstResponseAt,
};

async function lockAppeal(tx: Tx, scope: SQL, id: string): Promise<LockedAppeal | null> {
  const [row] = await tx
    .select(lockedColumns)
    .from(appeals)
    .innerJoin(appealTypes, eq(appealTypes.code, appeals.typeCode))
    .innerJoin(students, eq(students.id, appeals.studentId))
    .where(and(eq(appeals.id, id), scope))
    .limit(1)
    .for("update", { of: appeals });
  return row ?? null;
}

/**
 * Первое по очереди обращение под условием (самый ранний срок ответа), заблокированное до конца транзакции.
 * SKIP LOCKED: строку, которую прямо сейчас берёт другой сотрудник, пропускаем и берём следующую —
 * двое нажавших «Взять следующее» одновременно получают разные обращения, а не ошибку.
 */
export async function lockNext(tx: Tx, where: SQL): Promise<LockedAppeal | null> {
  const [row] = await tx
    .select(lockedColumns)
    .from(appeals)
    .innerJoin(appealTypes, eq(appealTypes.code, appeals.typeCode))
    .innerJoin(students, eq(students.id, appeals.studentId))
    .where(where)
    .orderBy(asc(appeals.slaDueAt), asc(appeals.createdAt))
    .limit(1)
    .for("update", { of: appeals, skipLocked: true });
  return row ?? null;
}

export async function addEvent(
  tx: Tx, appealId: string, actorUserId: string, kind: AppealEventKind, text: string | null, now: Date,
): Promise<void> {
  await tx.insert(appealEvents).values({ appealId, actorUserId, kind, text, createdAt: now });
}

/** Итог действия: новый статус и уведомление другой стороне (без него другой стороне уходит только appeal_updated). */
export type ActionOutcome = { status: AppealStatus; notice?: Notice };

export type ActionSpec = {
  /** Видимость: studentScope(v) или staffScope(v). */
  scope: SQL;
  /** Обращение, над которым действие. Вместо id можно передать pick — выбор первого по очереди. */
  id?: string;
  /** Выбрать и заблокировать обращение внутри транзакции (lockNext). Не нашлось → отказ empty. */
  pick?: (tx: Tx) => Promise<LockedAppeal | null>;
  now: Date;
  actorUserId: string;
  /** Кто другая сторона: студент обращения или все сотрудники его отдела. */
  counterpart: "student" | "staff";
  limit?: LimitSpec;
  /** Проверки до записи: статус, требования к вводу по виду обращения. */
  check?: (a: LockedAppeal) => Failure | null;
  apply: (tx: Tx, a: LockedAppeal) => Promise<ActionOutcome>;
};

/**
 * Общий ход действия над обращением: лимит → транзакция (блокировка строки в пределах видимости,
 * проверки, запись, уведомления) → realtime после коммита. Неудача возвращает резерв лимита.
 */
export async function runAppealAction(spec: ActionSpec): Promise<Result<{ status: AppealStatus; id?: string }>> {
  const { scope, id, pick, now, actorUserId, counterpart, limit } = spec;
  const reservation = limit
    ? await reserveAction(actorUserId, limit.action, limit.limit, limit.windowMs, now)
    : undefined;
  if (reservation === null) return fail("rate_limited");

  const done = await db.transaction(async (tx) => {
    const a = pick ? await pick(tx) : id !== undefined ? await lockAppeal(tx, scope, id) : null;
    if (!a) return fail(pick ? "empty" : "not_found");
    const refused = spec.check?.(a);
    if (refused) return refused;

    const outcome = await spec.apply(tx, a);
    const recipients = counterpart === "student" ? [a.studentUserId] : await departmentStaffUserIds(tx, a.departmentId);
    const href = counterpart === "student" ? studentHref(a.id) : staffHref(a.id);
    if (outcome.notice) await insertNotifications(tx, recipients, { ...outcome.notice, href }, now);
    return { ok: true as const, outcome, recipients, href, appealId: a.id };
  });

  if (!done.ok) {
    if (reservation !== undefined) await releaseAction(reservation);
    return done;
  }
  const { outcome, recipients, href, appealId } = done;
  await publishSafe(recipients, outcome.notice
    ? { type: "notification", title: outcome.notice.title, href, appealId }
    : { type: "appeal_updated", href, appealId });
  // id в ответе — только когда обращение выбирал сервер (pick): вызывающему нужно знать, какое взято
  return ok(pick ? { status: outcome.status, id: appealId } : { status: outcome.status });
}
