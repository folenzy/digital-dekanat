import "server-only";
import { isIP } from "node:net";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "../db/client";
import { loginAttempts } from "../db/schema";

// Лимиты входа: по паре «логин + IP» и отдельно по IP. Блокировки по одному логину нет:
// демо-учётки общие и опубликованы, иначе любой мог бы закрыть вход всему жюри.
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const PAIR_LIMIT = 5;
export const IP_LIMIT = 30;

export type LimitCheck = { limited: false } | { limited: true; retryAfterSec: number };

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

/** Когда ключ освободится, если в окне уже `limit` неудач; иначе null. */
async function blockedUntil(key: string, limit: number, now: Date): Promise<number | null> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  // limit-я с конца неудача в окне: когда она выйдет из окна, неудач станет меньше лимита
  const [row] = await db
    .select({ at: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)))
    .orderBy(desc(loginAttempts.createdAt))
    .offset(limit - 1)
    .limit(1);
  return row ? row.at.getTime() + LOGIN_WINDOW_MS : null;
}

export async function checkLoginLimit(login: string, ip: string, now: Date): Promise<LimitCheck> {
  const [pair, byIp] = await Promise.all([
    blockedUntil(pairKey(login, ip), PAIR_LIMIT, now),
    blockedUntil(ipKey(ip), IP_LIMIT, now),
  ]);
  if (pair === null && byIp === null) return { limited: false };
  const until = Math.max(pair ?? 0, byIp ?? 0);
  return { limited: true, retryAfterSec: Math.max(1, Math.ceil((until - now.getTime()) / 1000)) };
}

export async function recordLoginFailure(login: string, ip: string, now: Date): Promise<void> {
  await db.insert(loginAttempts).values([
    { key: pairKey(login, ip), success: false, createdAt: now },
    { key: ipKey(ip), success: false, createdAt: now },
  ]);
  // попутная уборка: записи старше окна больше ни на что не влияют
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(now.getTime() - LOGIN_WINDOW_MS)));
}

/** После успешного входа счётчик пары обнуляется; счётчик IP — нет. */
export async function clearLoginFailures(login: string, ip: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, pairKey(login, ip)));
}
