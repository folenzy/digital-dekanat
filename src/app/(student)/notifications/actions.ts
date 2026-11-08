"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStudent } from "@/server/auth/viewer";
import { listNotifications, markAllRead, markRead } from "@/server/notifications";
import { isSafeHref } from "@/ui/safe-href";

// Каждое действие — публичная точка входа (POST): кто ты, берём только из сессии.
// id уведомления приходит из формы и проверяется внутри markRead вместе с владельцем.

const notificationId = z.coerce.number().int().positive().max(2_147_483_647);

/** Открыть уведомление: отметить прочитанным и перейти по его ссылке (только внутренней). */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const v = await requireStudent();
  const parsed = notificationId.safeParse(formData.get("id"));
  if (!parsed.success) return;
  if (!(await markRead(v, parsed.data))) {
    refresh();
    return;
  }
  // Ссылку берём из своей записи в БД, а не из формы.
  const href = (await listNotifications(v)).find((n) => n.id === parsed.data)?.href;
  if (href && isSafeHref(href)) {
    revalidatePath("/", "layout"); // счётчик на колокольчике в оболочке
    redirect(href);
  }
  refresh();
}

/** Отметить прочитанными все свои уведомления. */
export async function markAllReadAction(): Promise<void> {
  const v = await requireStudent();
  await markAllRead(v);
  refresh();
}
