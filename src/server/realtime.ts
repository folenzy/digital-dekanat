import "server-only";
import { sql as dsql } from "drizzle-orm";
import { db, sql as pg } from "./db/client";

// Realtime поверх PostgreSQL LISTEN/NOTIFY: работает и при нескольких копиях приложения.
// publish — один pg_notify на пачку адресатов; subscribe — общий LISTEN на процесс.
export const LIVE_CHANNEL = "ns_events";
const MAX_PAYLOAD_BYTES = 7900; // предел NOTIFY — 8000 байт
/** 150 uuid ≈ 6 КБ: пачка с обычным событием остаётся под пределом NOTIFY. */
export const MAX_IDS_PER_NOTIFY = 150;

export type LiveEvent = {
  type: "notification" | "appeal_updated" | "announcement";
  title?: string;
  href?: string;
  appealId?: string;
};
export type LivePayload = { userIds: string[]; event: LiveEvent };

/** Одно событие для указанных пользователей: pg_notify с `{ userIds, event }`, адресаты режутся на пачки. */
export async function publish(userIds: string[], event: LiveEvent): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const payloads: string[] = [];
  for (let i = 0; i < unique.length; i += MAX_IDS_PER_NOTIFY) {
    const payload = JSON.stringify({ userIds: unique.slice(i, i + MAX_IDS_PER_NOTIFY), event } satisfies LivePayload);
    if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) {
      throw new Error(`Событие realtime больше ${MAX_PAYLOAD_BYTES} байт: сократи заголовок или ссылку`);
    }
    payloads.push(payload);
  }
  // Все пачки одним оператором: уходят вместе при коммите.
  const calls = dsql.join(payloads.map((p) => dsql`pg_notify(${LIVE_CHANNEL}, ${p})`), dsql`, `);
  await db.execute(dsql`select ${calls}`);
}

type Listener = (event: LiveEvent) => void;
const subscribers = new Map<string, Set<Listener>>();
let listening: Promise<unknown> | undefined;
let stopListening: (() => Promise<void>) | undefined;

function dispatch(raw: string): void {
  let payload: LivePayload;
  try {
    payload = JSON.parse(raw) as LivePayload;
  } catch {
    return;
  }
  if (!payload || !Array.isArray(payload.userIds) || !payload.event) return;
  for (const id of payload.userIds) {
    const set = subscribers.get(id);
    if (!set) continue;
    // Копия: подписчик может отписаться прямо из обработчика.
    for (const cb of [...set]) {
      try {
        cb(payload.event);
      } catch (e) {
        console.error("[realtime] подписчик упал:", (e as Error).message);
      }
    }
  }
}

/** Общий LISTEN на процесс, запускается при первом обращении; postgres.js сам переподключается и слушает заново. */
export function listenReady(): Promise<void> {
  listening ??= pg.listen(LIVE_CHANNEL, dispatch).then(
    (l) => { stopListening = () => l.unlisten(); },
    (e) => { listening = undefined; throw e; },
  );
  return listening.then(() => undefined);
}

/**
 * События для пользователя. Подписчик получает только `event`, без списка адресатов.
 * Возвращает функцию отписки. LISTEN стартует лениво; дождаться его можно через `listenReady()`.
 */
export function subscribe(userId: string, cb: (event: LiveEvent) => void): () => void {
  let set = subscribers.get(userId);
  if (!set) subscribers.set(userId, (set = new Set()));
  set.add(cb);
  listenReady().catch((e) => console.error("[realtime] LISTEN не стартовал:", (e as Error).message));
  return () => {
    const s = subscribers.get(userId);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) subscribers.delete(userId);
  };
}

/** Снимает общий LISTEN (для тестов и мягкой остановки процесса). */
export async function stopRealtime(): Promise<void> {
  const l = listening;
  listening = undefined;
  subscribers.clear();
  if (!l) return;
  await l.catch(() => undefined);
  await stopListening?.();
  stopListening = undefined;
}

/** Число активных подписчиков (для тестов утечек). */
export function subscriberCount(): number {
  let n = 0;
  for (const s of subscribers.values()) n += s.size;
  return n;
}
