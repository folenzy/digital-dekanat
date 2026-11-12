import type { Metadata } from "next";
import { requireStaff } from "@/server/auth/viewer";
import { currentTheme } from "@/server/theme";
import { SettingsPage } from "@/ui/profile/SettingsList";
import { ThemeForm } from "@/ui/profile/ThemeForm";

export const metadata: Metadata = { title: "Оформление" };

export default async function StaffThemePage() {
  await requireStaff();
  const theme = await currentTheme();
  return (
    <SettingsPage backHref="/staff/profile" title="Оформление" lead="Светлая тема — для дня, тёмная — для вечера и ночи: меньше света от экрана.">
      <ThemeForm current={theme} cancelHref="/staff/profile" />
    </SettingsPage>
  );
}
