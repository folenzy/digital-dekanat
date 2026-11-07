import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db/client";

// Realtime поверх PostgreSQL LISTEN/NOTIFY: работает и при нескольких копиях приложения.
// Здесь только публикация; подписку и SSE добавляет Task 9.
export const LIVE_CHANNEL = "ns_events";
const MAX_PAYLOAD_BYTES = 7900; // предел NOTIFY — 8000 байт

export type LiveEvent = {
  type: "notification" | "appeal_updated" | "announcement";
  title?: string;
  href?: string;
  appealId?: string;
};
export type LivePayload = { userIds: string[]; event: LiveEvent };

/** Одно событие для указанных пользователей: один pg_notify с `{ userIds, event }`. */
export async function publish(userIds: string[], event: LiveEvent): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const payload = JSON.stringify({ userIds: unique, event } satisfies LivePayload);
  if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error(`Событие realtime больше ${MAX_PAYLOAD_BYTES} байт: разбей адресатов на части`);
  }
  await db.execute(sql`select pg_notify(${LIVE_CHANNEL}, ${payload})`);
}
