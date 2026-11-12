import type { Metadata } from "next";
import { requireStaff } from "@/server/auth/viewer";
import { getSettings } from "@/server/settings";
import { SettingsPage } from "@/ui/profile/SettingsList";
import { StressEditor } from "@/ui/profile/StressEditor";
import { saveStaffStressAction } from "../actions";

export const metadata: Metadata = { title: "Ударения в имени" };

export default async function StaffStressPage() {
  const v = await requireStaff();
  const s = await getSettings(v);
  return (
    <SettingsPage
      backHref="/staff/profile"
      title="Ударения"
      lead="Отметь ударные гласные в своём имени: студенты увидят его с ударениями в обращениях. Здесь же можно выключить ударения в именах студентов."
    >
      <StressEditor name={s.name} stress={s.stress} showStress={s.showStress} action={saveStaffStressAction} cancelHref="/staff/profile" />
    </SettingsPage>
  );
}
