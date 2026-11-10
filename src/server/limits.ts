import "server-only";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "./db/client";
import { actionLog } from "./db/schema";

// Частотные лимиты действий на пользователя (защита общего демо от порчи), хранятся в action_log.
const HOUR_MS = 3_600_000;
export const LIMITS = {
  appeal: { action: "appeal_create", limit: 10, windowMs: HOUR_MS },
  announcement: { action: "announcement_create", limit: 10, windowMs: HOUR_MS },
  /** Сообщения студента. */
  message: { action: "appeal_message", limit: 30, windowMs: HOUR_MS },
  /** Ответы и уточнения сотрудника (общий счётчик): аккаунт сотрудника в демо делит всё жюри. */
  staffMessage: { action: "appeal_message", limit: 120, windowMs: HOUR_MS },
} as const;
export type LimitSpec = { action: string; limit: number; windowMs: number };

/**
 * Резервирует действие: в одной транзакции под блокировкой на пару «пользователь + действие» считает
 * записи в окне и, если лимит не исчерпан, добавляет свою. Параллельные запросы одной пары идут по очереди,
 * поэтому лимит точный: из N одновременных при пустом окне проходят ровно min(N, limit). Отказ ничего
 * не записывает и лимит не продлевает. Возвращает id резерва или null, если лимит исчерпан.
 * Вызывать вне транзакции: резерв должен закоммититься раньше самого действия.
 */
export async function reserveAction(
  userId: string, action: string, limit: number, windowMs: number, now: Date,
): Promise<number | null> {
  const since = new Date(now.getTime() - windowMs);
  try {
    return await db.transaction(async (tx) => {
      // Флуд одним (общим) аккаунтом не должен занять все соединения пула ожиданием блокировки:
      // дольше LOCK_TIMEOUT не ждём, отказ — как при исчерпанном лимите (fail closed).
      await tx.execute(sql.raw(`set local lock_timeout = '${LOCK_TIMEOUT}'`));
      // Своё пространство ключей (первый ключ 'limits'): не пересекается с блокировкой создания обращений.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('limits'), hashtext(${`${userId}:${action}`}))`);
      const [{ n }] = await tx.select({ n: count() }).from(actionLog)
        .where(and(eq(actionLog.userId, userId), eq(actionLog.action, action), gt(actionLog.createdAt, since)));
      if (n >= limit) return null;
      const [mine] = await tx.insert(actionLog).values({ userId, action, createdAt: now }).returning({ id: actionLog.id });
      return mine.id;
    });
  } catch (e) {
    if (isLockTimeout(e)) return null;
    throw e;
  }
}

/** Константа, не ввод: SET не принимает параметры, поэтому sql.raw. */
const LOCK_TIMEOUT = "2s";

/** 55P03 lock_not_available — сработал lock_timeout. Drizzle заворачивает ошибку драйвера в cause. */
function isLockTimeout(e: unknown): boolean {
  for (let cur: unknown = e; cur && typeof cur === "object"; cur = (cur as { cause?: unknown }).cause) {
    if ((cur as { code?: unknown }).code === "55P03") return true;
  }
  return false;
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
