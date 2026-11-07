import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
