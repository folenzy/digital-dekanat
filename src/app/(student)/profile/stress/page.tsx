import type { Metadata } from "next";
import { requireStudent } from "@/server/auth/viewer";
import { getSettings } from "@/server/settings";
import { SettingsPage } from "@/ui/profile/SettingsList";
import { StressEditor } from "@/ui/profile/StressEditor";
import { saveStressAction } from "../actions";

export const metadata: Metadata = { title: "Ударения в имени" };

export default async function StressPage() {
  const v = await requireStudent();
  const s = await getSettings(v);
  return (
    <SettingsPage
      backHref="/profile"
      title="Ударения"
      lead="Отметь гласные, на которые падает ударение в твоих фамилии, имени и отчестве. Сотрудники деканата увидят имя с ударениями и не будут его коверкать."
    >
      <StressEditor name={s.name} stress={s.stress} showStress={s.showStress} action={saveStressAction} cancelHref="/profile" />
    </SettingsPage>
  );
}
