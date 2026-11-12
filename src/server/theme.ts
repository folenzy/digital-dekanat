import "server-only";
import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

/** Тема текущего запроса из cookie. Значение от клиента: всё, кроме известных кодов, — светлая. */
export async function currentTheme(): Promise<Theme> {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}
