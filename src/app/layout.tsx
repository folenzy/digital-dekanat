import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
// Шрифты self-host (@fontsource-variable, OFL-1.1), в каждом есть кириллица; браузер качает только нужные
// подмножества по unicode-range. Literata — с осью оптического размера (opsz) для крупных заголовков.
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/golos-text/wght.css";
import "@/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "На связи — цифровой деканат", template: "%s — На связи" },
  description:
    "Концепт кабинета студента вымышленного Университета Ориентир для конкурса «Цифровой деканат будущего». " +
    "Не официальный сервис, все данные вымышлены.",
  applicationName: "На связи",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4EFE6",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP с nonce (src/proxy.ts) требует рендера на каждый запрос: в статической странице скрипты остались бы
  // без nonce, и браузер их заблокировал бы. connection() гарантирует это для любой будущей страницы.
  await connection();
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
