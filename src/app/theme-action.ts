"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isTheme, THEME_COOKIE } from "@/lib/theme";
import { getViewer } from "@/server/auth/viewer";

// Смена темы оформления. В cookie пишется только одно из двух известных значений; куда вернуться —
// решает сервер по роли из сессии, а не форма (никаких адресов возврата от клиента).

const YEAR = 60 * 60 * 24 * 365;

export async function setThemeAction(form: FormData): Promise<void> {
  const v = await getViewer();
  const back = v === null ? "/login" : v.role === "staff" ? "/staff/profile" : "/profile";
  const theme = form.get("theme");
  if (!isTheme(theme)) redirect(back);

  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
  });
  redirect(v === null ? back : `${back}?saved=theme`);
}
