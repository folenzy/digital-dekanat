import "server-only";
import { isIP } from "node:net";
import { and, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { db } from "../db/client";
import { loginAttempts } from "../db/schema";

// Лимиты входа: по паре «логин + IP» и отдельно по IP. Блокировки по одному логину нет:
// демо-учётки общие и опубликованы, иначе любой мог бы закрыть вход всему жюри.
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const PAIR_LIMIT = 5;
export const IP_LIMIT = 30;

const pairKey = (login: string, ip: string) => `pair:${login.trim().toLowerCase()}|${ip}`;
const ipKey = (ip: string) => `ip:${ip}`;

/**
 * IP клиента: первый адрес x-forwarded-for, иначе x-real-ip, иначе 'unknown'.
 * Доверять этим заголовкам можно только за обратным прокси (Caddy), который их перезаписывает.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isIP(forwarded)) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  if (real && isIP(real)) return real;
  return "unknown";
}

/** Попытка входа, заранее записанная как неудача (до проверки пароля). */
export type LoginAttempt = { pair: string; pairId: number; ipId: number; now: Date };
export type AttemptStart = { limited: true; retryAfterSec: number } | { limited: false; attempt: LoginAttempt };

/**
 * Если неудач в окне (вместе со своей строкой `mineId`) больше `limit` — момент, когда ключ освободится
 * без своей строки: тогда limit-я с конца чужая неудача выйдет из окна. Иначе null.
 */
async function blockedUntil(key: string, limit: number, mineId: number, now: Date): Promise<number | null> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const rows = await db
    .select({ id: loginAttempts.id, at: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)))
    .orderBy(desc(loginAttempts.createdAt), desc(loginAttempts.id))
    .limit(limit + 1);
  if (rows.length <= limit) return null;
  const others = rows.filter((r) => r.id !== mineId);
  return others[limit - 1].at.getTime() + LOGIN_WINDOW_MS;
}

/**
 * Резервирует попытку: сначала записывает неудачу для пары и IP, потом считает неудачи в окне вместе с ней.
 * Проверка и запись не разделены паузой на argon2, поэтому параллельные запросы не проскакивают:
 * запрос, чья строка записана k-й, видит не меньше k строк. При превышении лимита свои строки
 * удаляются — заблокированные попытки не продлевают блокировку.
 */
export async function beginLoginAttempt(login: string, ip: string, now: Date): Promise<AttemptStart> {
  const pair = pairKey(login, ip);
  const byIp = ipKey(ip);
  const rows = await db
    .insert(loginAttempts)
    .values([{ key: pair, success: false, createdAt: now }, { key: byIp, success: false, createdAt: now }])
    .returning({ id: loginAttempts.id, key: loginAttempts.key });
  const pairId = rows.find((r) => r.key === pair)!.id;
  const ipId = rows.find((r) => r.key === byIp)!.id;

  const [pairUntil, ipUntil] = await Promise.all([
    blockedUntil(pair, PAIR_LIMIT, pairId, now),
    blockedUntil(byIp, IP_LIMIT, ipId, now),
  ]);
  if (pairUntil === null && ipUntil === null) return { limited: false, attempt: { pair, pairId, ipId, now } };

  await db.delete(loginAttempts).where(inArray(loginAttempts.id, [pairId, ipId]));
  const until = Math.max(pairUntil ?? 0, ipUntil ?? 0);
  return { limited: true, retryAfterSec: Math.max(1, Math.ceil((until - now.getTime()) / 1000)) };
}

/** Неверный пароль: зарезервированные строки остаются неудачами; попутно убираем записи старше окна. */
export async function failLoginAttempt(attempt: LoginAttempt): Promise<void> {
  await db.delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, new Date(attempt.now.getTime() - LOGIN_WINDOW_MS)));
}

/** Успешный вход: счётчик пары обнуляется, из счётчика IP убирается только эта попытка. */
export async function succeedLoginAttempt(attempt: LoginAttempt): Promise<void> {
  await db.delete(loginAttempts)
    .where(or(eq(loginAttempts.key, attempt.pair), eq(loginAttempts.id, attempt.ipId)));
}
