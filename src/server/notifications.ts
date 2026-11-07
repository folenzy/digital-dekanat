import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Viewer } from "./auth/viewer";
import { db } from "./db/client";
import { notifications } from "./db/schema";

export type NotificationView = {
  id: number; kind: string; title: string; body: string; href: string | null;
  createdAt: Date; read: boolean; readAt: Date | null;
};

// Все функции берут пользователя только из Viewer и всегда фильтруют по user_id.

export async function listNotifications(
  v: Viewer, opts: { unreadOnly?: boolean } = {},
): Promise<NotificationView[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, v.userId), opts.unreadOnly ? isNull(notifications.readAt) : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.id));
  return rows.map((n) => ({
    id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href,
    createdAt: n.createdAt, read: n.readAt !== null, readAt: n.readAt,
  }));
}

export async function unreadCount(v: Viewer): Promise<number> {
  const [r] = await db.select({ n: count() }).from(notifications)
    .where(and(eq(notifications.userId, v.userId), isNull(notifications.readAt)));
  return r.n;
}

/** true — уведомление твоё (уже прочитанное остаётся с прежним read_at); false — чужое или не найдено. */
export async function markRead(v: Viewer, id: number): Promise<boolean> {
  const rows = await db.update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, v.userId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** Помечает прочитанными все свои непрочитанные; возвращает, сколько изменено. */
export async function markAllRead(v: Viewer): Promise<number> {
  const rows = await db.update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.userId, v.userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}
