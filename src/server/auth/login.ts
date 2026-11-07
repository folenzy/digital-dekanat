import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";
import { checkLoginLimit, clearLoginFailures, recordLoginFailure } from "./rate-limit";
import { createSession, type Role } from "./session";

export type LoginResult =
  | { ok: true; token: string; role: Role; expiresAt: Date }
  | { ok: false; error: "invalid" }
  | { ok: false; error: "rate_limited"; retryAfterSec: number };

// Одно сообщение для неверного логина и неверного пароля.
export const LOGIN_INVALID_MESSAGE = "Неверный логин или пароль";

export function rateLimitedMessage(retryAfterSec: number): string {
  return `Слишком много попыток, попробуй через ${Math.max(1, Math.ceil(retryAfterSec / 60))} мин`;
}

// Фиктивный argon2id-хеш для неизвестного логина: ответ занимает столько же времени,
// сколько проверка настоящего пароля, и не выдаёт, существует ли логин.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url")).catch((e: unknown) => {
    dummyHash = undefined;
    throw e;
  });
  return dummyHash;
}

/**
 * Вход по логину и паролю. Логины хранятся в нижнем регистре; ввод нормализуется так же.
 * Пользователь без логина или без хеша пароля войти не может.
 */
export async function login(
  loginName: string, password: string, ip: string, now: Date, userAgent?: string | null,
): Promise<LoginResult> {
  const name = loginName.trim().toLowerCase();
  const limit = await checkLoginLimit(name, ip, now);
  if (limit.limited) return { ok: false, error: "rate_limited", retryAfterSec: limit.retryAfterSec };

  const [user] = await db
    .select({ id: users.id, role: users.role, passwordHash: users.passwordHash })
    .from(users).where(eq(users.login, name)).limit(1);
  const hash = user?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(hash, password);
  if (!user?.passwordHash || !passwordOk) {
    await recordLoginFailure(name, ip, now);
    return { ok: false, error: "invalid" };
  }

  await clearLoginFailures(name, ip);
  const { token, expiresAt } = await createSession(user.id, userAgent, now);
  return { ok: true, token, role: user.role, expiresAt };
}
