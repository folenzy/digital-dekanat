// Тема оформления: светлая «Бумага» или тёмная «Ночная смена». Чистые данные и функции — для сервера и клиента.
// Выбор хранится в cookie, а не в профиле: тема — настройка устройства (телефон ночью тёмный, ноутбук днём
// светлый), и тестовые аккаунты общие — один эксперт не должен менять оформление другому.

export const THEMES = [
  { code: "light", label: "Светлая", hint: "«Бумага»: кремовый лист, терракотовый акцент" },
  { code: "dark", label: "Тёмная", hint: "«Ночная смена»: сине-серые тона, голубой акцент" },
] as const;
export type Theme = (typeof THEMES)[number]["code"];

export const THEME_COOKIE = "ns_theme";
export const DEFAULT_THEME: Theme = "light";

/** Цвет системной панели браузера под тему (совпадает с --bg в src/ui/tokens.css). */
export const THEME_COLOR: Record<Theme, string> = { light: "#F4EFE6", dark: "#0E1218" };

/** Тема из значения cookie или формы: всё незнакомое — светлая. */
export function parseTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function themeLabel(theme: Theme): string {
  return THEMES.find((t) => t.code === theme)!.label;
}
