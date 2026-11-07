import "server-only";
import { eq } from "drizzle-orm";
import { notifications, staff, staffDepartments } from "../db/schema";
import { publish, type LiveEvent } from "../realtime";
import type { Tx } from "./access";

// Уведомления по обращениям: строки notifications пишутся в транзакции действия, realtime — после коммита.

export const studentHref = (appealId: string) => `/dekanat/${appealId}`;
export const staffHref = (appealId: string) => `/staff/appeals/${appealId}`;

export type Notice = { kind: string; title: string; body: string };

/** Все сотрудники отдела (их user_id) — адресаты нового обращения и сообщений студента. */
export async function departmentStaffUserIds(tx: Tx, departmentId: number): Promise<string[]> {
  const rows = await tx.select({ userId: staff.userId }).from(staffDepartments)
    .innerJoin(staff, eq(staff.id, staffDepartments.staffId))
    .where(eq(staffDepartments.departmentId, departmentId));
  return rows.map((r) => r.userId);
}

export async function insertNotifications(
  tx: Tx, userIds: string[], n: Notice & { href: string }, now: Date,
): Promise<void> {
  if (userIds.length === 0) return;
  await tx.insert(notifications).values(userIds.map((userId) => ({
    userId, kind: n.kind, title: n.title, body: n.body, href: n.href, createdAt: now,
  })));
}

/** Realtime — лучшее усилие: действие уже закоммичено, уведомление лежит в БД, сбой NOTIFY его не отменяет. */
export async function publishSafe(userIds: string[], event: LiveEvent): Promise<void> {
  try {
    await publish(userIds, event);
  } catch (e) {
    console.error("[realtime] publish не удался:", (e as Error).message);
  }
}

/** Начало текста для тела уведомления; режет по символам Unicode, не разрывая эмодзи. */
export function excerpt(text: string, max = 140): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}
