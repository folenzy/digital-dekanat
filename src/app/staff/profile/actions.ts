"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/server/auth/viewer";
import { saveNameStress } from "@/server/settings";
import { stressFromForm } from "@/ui/profile/form";

// Ударения в имени сотрудника: студенты видят их в своих обращениях.
export async function saveStaffStressAction(form: FormData): Promise<void> {
  const v = await requireStaff();
  await saveNameStress(v, stressFromForm(form), form.get("show") === "on");
  redirect("/staff/profile?saved=stress");
}
