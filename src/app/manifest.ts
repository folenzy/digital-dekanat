import type { MetadataRoute } from "next";

// Манифест: иконка «На связи» на экране «Домой» и запуск без адресной строки.
// Цвета белые: это светлая тема по умолчанию; тёмная подстраивает панель через viewport.themeColor в layout.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "На связи — цифровой деканат",
    short_name: "На связи",
    description: "Концепт кабинета студента вымышленного Университета Ориентир. Все данные вымышлены.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
