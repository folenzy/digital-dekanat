"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { LOGIN_INVALID_MESSAGE, login, rateLimitedMessage } from "@/server/auth/login";
import { clientIp } from "@/server/auth/rate-limit";
import { destroySession } from "@/server/auth/session";

// Здесь только экспортируемые async-функции: каждая из них — публичная точка входа (POST).

const credentials = z.object({
  login: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(128),
});

/** Состояние формы входа для useActionState: null — ошибок нет. */
export type LoginFormState = { error: string } | null;

export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = credentials.safeParse({ login: formData.get("login"), password: formData.get("password") });
  if (!parsed.success) return { error: LOGIN_INVALID_MESSAGE };

  const h = await headers();
  const result = await login(parsed.data.login, parsed.data.password, clientIp(h), new Date(), h.get("user-agent"));
  if (!result.ok) {
    return {
      error: result.error === "rate_limited" ? rateLimitedMessage(result.retryAfterSec) : LOGIN_INVALID_MESSAGE,
    };
  }

  (await cookies()).set(SESSION_COOKIE.name, result.token, SESSION_COOKIE.options(result.expiresAt));
  redirect(result.role === "staff" ? "/staff" : "/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE.name)?.value;
  if (token) await destroySession(token);
  // те же атрибуты, что при установке: cookie __Host- без Secure браузер не примет даже для удаления
  store.set(SESSION_COOKIE.name, "", { ...SESSION_COOKIE.options(new Date(0)), maxAge: 0 });
  redirect("/login");
}
