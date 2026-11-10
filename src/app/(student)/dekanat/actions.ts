"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { confirmReceived, createAppeal, postStudentMessage } from "@/server/appeals/service";
import { isAppealTypeCode } from "@/server/appeals/types";
import { requireStudent } from "@/server/auth/viewer";
import {
  appealFailureState, messageFailureText, type AppealFormState, type MessageFormState,
} from "./form-state";
import { fieldsFromForm, formValues } from "./wizard";

// Каждое действие — публичная точка входа (POST). Кто ты, берём только из сессии; «сейчас» — на сервере.
// id обращения из формы — только ключ поиска: сервисы ищут его в пределах обращений этого студента.

const text = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** Новое обращение (шаг 3 мастера). Успех → карточка с подтверждением; ошибка → форма с текстами у полей. */
export async function createAppealAction(_prev: AppealFormState, form: FormData): Promise<AppealFormState> {
  const v = await requireStudent();
  const type = text(form, "typeCode");
  if (!isAppealTypeCode(type)) return { error: "Выбери тип обращения", fieldErrors: {}, values: {} };

  const res = await createAppeal(v, type, fieldsFromForm(type, form));
  if (!res.ok) return appealFailureState(res, formValues(type, form));
  redirect(`/dekanat/${res.value.id}?created=1`);
}

/** Сообщение в переписку обращения (и ответ на уточнение). Успех — карточка перерисовывается. */
export async function postMessageAction(prev: MessageFormState, form: FormData): Promise<MessageFormState> {
  const v = await requireStudent();
  const sent = prev?.sent ?? 0;
  const res = await postStudentMessage(v, text(form, "appealId"), text(form, "text"));
  if (!res.ok) return { ok: false, error: messageFailureText(res), sent };
  refresh();
  return { ok: true, sent: sent + 1 };
}

/** «Получил»: готовое обращение закрывается. Если статус уже другой — просто показываем актуальный. */
export async function confirmReceivedAction(form: FormData): Promise<void> {
  const v = await requireStudent();
  await confirmReceived(v, text(form, "appealId"));
  refresh();
}
