"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { staffHref } from "@/lib/hrefs";
import { createAnnouncement } from "@/server/announcements";
import type { Result } from "@/server/appeals/result";
import { markReady, rejectAppeal, replyAppeal, requestInfo, takeAppeal, takeNextAppeal } from "@/server/appeals/staff";
import type { Pickup } from "@/server/appeals/types";
import { requireStaff } from "@/server/auth/viewer";
import {
  announcementFailureState, audienceFromForm, parsePickupUntil, staffFailure,
  type AnnouncementFormState, type StaffActionState,
} from "./form-state";

// Каждое действие — публичная точка входа (POST): сначала requireStaff(), кто ты — только из сессии,
// «сейчас» — на сервере. id обращения из формы — лишь ключ поиска: функции сотрудника ищут его
// в пределах отделов этого сотрудника (чужое → not_found).

const text = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** Итог действия для формы: успех — карточка перерисовывается с новым статусом. */
function settle(res: Result<unknown>, prev: StaffActionState): StaffActionState {
  const seq = (prev?.seq ?? 0) + 1;
  if (!res.ok) return { ok: false, ...staffFailure(res), seq };
  refresh();
  return { ok: true, seq };
}

/** «Взять в работу»: Отправлено → В работе, исполнитель — этот сотрудник. */
export async function takeAction(prev: StaffActionState, form: FormData): Promise<StaffActionState> {
  const v = await requireStaff();
  return settle(await takeAppeal(v, text(form, "appealId")), prev);
}

/**
 * «Взять следующее»: самое срочное новое обращение в своих отделах — в работу, и сразу открыть его.
 * Отдел из формы — только фильтр: искать будут в пределах отделов этого сотрудника.
 */
export async function takeNextAction(prev: StaffActionState, form: FormData): Promise<StaffActionState> {
  const v = await requireStaff();
  const raw = text(form, "dept");
  const dept = /^\d{1,9}$/.test(raw) ? Number(raw) : undefined;
  const res = await takeNextAppeal(v, dept);
  if (!res.ok) return { ok: false, ...staffFailure(res), seq: (prev?.seq ?? 0) + 1 };
  redirect(staffHref(res.value.id));
}

/** Ответ студенту в переписку (на «Отправлено» сначала берёт в работу). */
export async function replyAction(prev: StaffActionState, form: FormData): Promise<StaffActionState> {
  const v = await requireStaff();
  return settle(await replyAppeal(v, text(form, "appealId"), text(form, "text")), prev);
}

/** «Запросить уточнение»: В работе → Нужно уточнение, вопрос уходит в переписку. */
export async function requestInfoAction(prev: StaffActionState, form: FormData): Promise<StaffActionState> {
  const v = await requireStaff();
  return settle(await requestInfo(v, text(form, "appealId"), text(form, "question")), prev);
}

/** «Готово». Форма справки присылает место и дату выдачи; у остальных видов полей нет → pickup = null. */
export async function markReadyAction(prev: StaffActionState, form: FormData): Promise<StaffActionState> {
  const v = await requireStaff();
  let pickup: Pickup | null = null;
  if (form.has("place") || form.has("until")) {
    const parsed = parsePickupUntil(text(form, "until"), new Date());
    if ("error" in parsed) return { ok: false, error: "", fieldErrors: { until: parsed.error }, seq: (prev?.seq ?? 0) + 1 };
    pickup = { place: text(form, "place"), until: parsed.until };
  }
  return settle(await markReady(v, text(form, "appealId"), pickup), prev);
}

/** «Отклонить» с причиной (5–500). Подтверждение — на клиенте, вторым нажатием. */
export async function rejectAction(prev: StaffActionState, form: FormData): Promise<StaffActionState> {
  const v = await requireStaff();
  return settle(await rejectAppeal(v, text(form, "appealId"), text(form, "reason")), prev);
}

const ANNOUNCEMENT_FIELDS = ["title", "body", "audience", "facultyId", "course", "groupId", "important"];

/** Публикация объявления: аудитория из формы, уведомления студентам — в createAnnouncement. */
export async function publishAnnouncementAction(
  prev: AnnouncementFormState, form: FormData,
): Promise<AnnouncementFormState> {
  const v = await requireStaff();
  const seq = (prev?.seq ?? 0) + 1;
  const values = Object.fromEntries(ANNOUNCEMENT_FIELDS.map((k) => [k, text(form, k)]));
  const aud = audienceFromForm(form);
  if ("fieldErrors" in aud) {
    return { ok: false, error: "Проверь отмеченные поля", fieldErrors: aud.fieldErrors, values, seq };
  }
  const res = await createAnnouncement(v, {
    title: values.title, body: values.body, important: values.important === "on", audience: aud.audience,
  });
  if (!res.ok) return announcementFailureState(res, values, seq);
  refresh();
  return { ok: true, recipients: res.value.recipients, seq };
}
