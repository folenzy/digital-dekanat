import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users, type roleEnum } from "../db/schema";

export type Role = (typeof roleEnum.enumValues)[number];
export type SessionUser = { userId: string; role: Role };

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_SEEN_STEP_MS = 60_000;
const USER_AGENT_MAX = 256;

/** В БД хранится только sha-256 токена: утечка таблицы не даёт войти. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Новая сессия на 7 дней. Токен (32 случайных байта, base64url) отдаётся один раз — для cookie. */
export async function createSession(
  userId: string, userAgent?: string | null, now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, now)));
  await db.insert(sessions).values({
    tokenHash: hashToken(token), userId, expiresAt, createdAt: now, lastSeenAt: now,
    userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null,
  });
  return { token, expiresAt };
}

/** Пользователь по токену из cookie; истекшая сессия удаляется и даёт null. */
export async function getSessionUser(token: string, now: Date = new Date()): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({
      id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt, role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  if (now.getTime() - row.lastSeenAt.getTime() >= LAST_SEEN_STEP_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
  }
  return { userId: row.userId, role: row.role };
}

export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
