import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
// Шрифты self-host (@fontsource-variable, OFL-1.1), в каждом есть кириллица; браузер качает только нужные
// подмножества по unicode-range. Literata — с осью оптического размера (opsz) для крупных заголовков.
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/golos-text/wght.css";
import "@/ui/tokens.css";
import "./globals.css";
import { THEME_COLOR } from "@/lib/theme";
import { currentTheme } from "@/server/theme";

export const metadata: Metadata = {
  title: { default: "На связи — цифровой деканат", template: "%s — На связи" },
  description:
    "Концепт кабинета студента вымышленного Университета Ориентир для конкурса «Цифровой деканат будущего». " +
    "Не официальный сервис, все данные вымышлены.",
  applicationName: "На связи",
};

// Цвет системной панели браузера — под выбранную тему (cookie), поэтому не константа, а функция.
export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: THEME_COLOR[await currentTheme()],
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP с nonce (src/proxy.ts) требует рендера на каждый запрос: в статической странице скрипты остались бы
  // без nonce, и браузер их заблокировал бы. connection() гарантирует это для любой будущей страницы.
  await connection();
  // Тема приходит с сервером в первом же байте разметки: без встроенного скрипта (CSP) и без вспышки светлого.
  const theme = await currentTheme();
  return (
    <html lang="ru" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
