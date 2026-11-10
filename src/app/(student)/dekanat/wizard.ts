import {
  APPEAL_TYPES, APPEAL_TEXT_LIMITS, isAppealTypeCode, type AppealTopic, type AppealTypeCode,
} from "@/server/appeals/types";
import { isTopic } from "@/ui/appeals/labels";

// Мастер нового обращения: состояние живёт в адресе (?topic= / ?type= / ?text= / ?prefill=1),
// поэтому работает без JS и кнопка «назад» браузера возвращает на предыдущий шаг.

export type SearchParams = Record<string, string | string[] | undefined>;

export type WizardState =
  | { step: 1; text: string }
  | { step: 2; topic: AppealTopic; text: string }
  | { step: 3; type: AppealTypeCode; topic: AppealTopic; text: string; prefill: boolean };

const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" ? v : undefined);

/** Обрезать до n UTF-16 символов (как считает сервер), не оставляя половинку эмодзи. */
function cut(s: string, n: number): string {
  if (s.length <= n) return s;
  const head = s.slice(0, n);
  const last = head.charCodeAt(n - 1);
  return last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head;
}

export function parseWizardParams(sp: SearchParams): WizardState {
  const text = cut((one(sp.text) ?? "").trim(), APPEAL_TEXT_LIMITS.message).trim();
  const type = one(sp.type);
  if (isAppealTypeCode(type)) {
    return { step: 3, type, topic: APPEAL_TYPES[type].topic, text, prefill: one(sp.prefill) === "1" };
  }
  const topic = one(sp.topic);
  if (isTopic(topic)) return { step: 2, topic, text };
  return { step: 1, text };
}

/** Ссылка на шаг мастера; текст из «Спроси деканат» едет дальше. */
export function wizardHref(p: { topic?: AppealTopic; type?: AppealTypeCode; text?: string }): string {
  const q = new URLSearchParams();
  if (p.type) q.set("type", p.type);
  else if (p.topic) q.set("topic", p.topic);
  if (p.text) q.set("text", p.text);
  const s = q.toString();
  return s ? `/dekanat/new?${s}` : "/dekanat/new";
}

export function typesOfTopic(topic: AppealTopic): AppealTypeCode[] {
  return (Object.keys(APPEAL_TYPES) as AppealTypeCode[]).filter((c) => APPEAL_TYPES[c].topic === topic);
}

/** Текст заявления на повышенную стипендию для «Подать в 1 тап» (его можно поправить перед отправкой). */
export const STIPEND_TEMPLATE =
  "Прошу рассмотреть возможность назначения мне повышенной академической стипендии. "
  + "По итогам прошлой сессии у меня нет троек и задолженностей. Если нужны подтверждающие документы, "
  + "напишите, пожалуйста, — принесу их в единое окно.";

const COMMENT_MAX = 500;

/** Поля формы подтипа (имена совпадают с fields в APPEAL_TYPES). */
export function formFieldNames(type: AppealTypeCode): string[] {
  const t = APPEAL_TYPES[type];
  if (t.topic === "certificates") return ["destination", "copies", "format", "comment"];
  return type === "study_retake" ? ["text", "disciplineId"] : ["text"];
}

/** Начальные значения формы шага 3: текст из адреса или шаблон «в 1 тап». */
export function initialValues(type: AppealTypeCode, text: string, prefill: boolean): Record<string, string> {
  if (APPEAL_TYPES[type].topic === "certificates") {
    return { destination: "", copies: "1", format: "paper", comment: cut(text, COMMENT_MAX) };
  }
  const value = text || (prefill && type === "stip_increased" ? STIPEND_TEMPLATE : "");
  return type === "study_retake" ? { text: value, disciplineId: "" } : { text: value };
}

const str = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** Строки полей подтипа — чтобы показать форму с ошибкой, не потеряв введённое. */
export function formValues(type: AppealTypeCode, form: FormData): Record<string, string> {
  return Object.fromEntries(formFieldNames(type).map((k) => [k, str(form, k)]));
}

const numberOrUndefined = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

/**
 * Поля обращения из формы. Берём только поля подтипа (лишние из формы не проходят); числа — числами,
 * как ждут схемы. Проверку значений делает сервер (createAppeal).
 */
export function fieldsFromForm(type: AppealTypeCode, form: FormData): Record<string, unknown> {
  if (APPEAL_TYPES[type].topic === "certificates") {
    const comment = str(form, "comment");
    return {
      destination: str(form, "destination"),
      copies: numberOrUndefined(str(form, "copies")),
      format: str(form, "format") || undefined,
      ...(comment.trim() ? { comment } : {}),
    };
  }
  const out: Record<string, unknown> = { text: str(form, "text") };
  if (type === "study_retake") {
    const d = numberOrUndefined(str(form, "disciplineId"));
    if (d !== undefined) out.disciplineId = d;
  }
  return out;
}
