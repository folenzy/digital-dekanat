"use server";

import { redirect } from "next/navigation";
import { requireStudent } from "@/server/auth/viewer";
import { saveNameStress, saveNotifyMuted, saveStudyLanguage } from "@/server/settings";
import { mutedFromForm, stressFromForm } from "@/ui/profile/form";

// Настройки профиля студента. Кто сохраняет — берётся из сессии; из формы — только сами значения,
// и каждое проверяется на сервере (ударение должно попадать на гласную своего имени, язык — быть в списке).

export async function saveStressAction(form: FormData): Promise<void> {
  const v = await requireStudent();
  await saveNameStress(v, stressFromForm(form), form.get("show") === "on");
  redirect("/profile?saved=stress");
}

export async function saveLanguageAction(form: FormData): Promise<void> {
  const v = await requireStudent();
  const saved = await saveStudyLanguage(v, form.get("language"));
  redirect(saved ? "/profile?saved=language" : "/profile/language?error=1");
}

export async function saveNotificationsAction(form: FormData): Promise<void> {
  const v = await requireStudent();
  await saveNotifyMuted(v, mutedFromForm(form));
  redirect("/profile?saved=notifications");
}
