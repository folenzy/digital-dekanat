import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "./db/client";
import { actionLog } from "./db/schema";

// Частотные лимиты действий на пользователя (защита общего демо от порчи), хранятся в action_log.
const HOUR_MS = 3_600_000;
export const LIMITS = {
  appeal: { action: "appeal_create", limit: 10, windowMs: HOUR_MS },
  /** Сообщения студента. */
  message: { action: "appeal_message", limit: 30, windowMs: HOUR_MS },
  /** Ответы и уточнения сотрудника (общий счётчик): аккаунт сотрудника в демо делит всё жюри. */
  staffMessage: { action: "appeal_message", limit: 120, windowMs: HOUR_MS },
} as const;
export type LimitSpec = { action: string; limit: number; windowMs: number };

/**
 * Резервирует действие: сначала записывает его в action_log, потом считает записи в окне вместе с ней.
 * Каждый оператор коммитится сам, поэтому параллельные запросы не проскакивают: запрос, чья строка
 * записана k-й, видит не меньше k строк. При превышении своя строка удаляется (отказ не продлевает лимит).
 * Возвращает id резерва или null, если лимит исчерпан. Вызывать вне транзакции.
 */
export async function reserveAction(
  userId: string, action: string, limit: number, windowMs: number, now: Date,
): Promise<number | null> {
  const [mine] = await db.insert(actionLog).values({ userId, action, createdAt: now }).returning({ id: actionLog.id });
  const since = new Date(now.getTime() - windowMs);
  const [{ n }] = await db.select({ n: count() }).from(actionLog)
    .where(and(eq(actionLog.userId, userId), eq(actionLog.action, action), gt(actionLog.createdAt, since)));
  if (n <= limit) return mine.id;
  await db.delete(actionLog).where(eq(actionLog.id, mine.id));
  return null;
}

/** true — действие разрешено и учтено; false — лимит в окне исчерпан. */
export async function consumeAction(
  userId: string, action: string, limit: number, windowMs: number, now: Date,
): Promise<boolean> {
  return (await reserveAction(userId, action, limit, windowMs, now)) !== null;
}

/** Возвращает резерв, если действие в итоге не состоялось (повтор, чужое обращение, неверный статус). */
export async function releaseAction(id: number): Promise<void> {
  await db.delete(actionLog).where(eq(actionLog.id, id));
}
