import { z } from "zod";

export type AppealTopic = "certificates" | "study" | "stipend";
export type AppealKind = "certificate" | "application" | "question";
export type DepartmentCode = "docs" | "study" | "stipend";

export type AppealTypeDef = {
  topic: AppealTopic;
  kind: AppealKind;
  department: DepartmentCode;
  title: string;
  hint: string;
  slaDays: number;
  fields: z.ZodObject;
};

const certFields = z.object({
  destination: z.string().trim().min(1).max(120),
  copies: z.number().int().min(1).max(5),
  format: z.enum(["paper", "electronic"]),
  comment: z.string().max(500).optional(),
});

const studyFields = z.object({
  text: z.string().trim().min(10).max(2000),
  disciplineId: z.number().int().optional(),
});

const stipendFields = z.object({
  text: z.string().trim().min(10).max(2000),
});

const certificate = (title: string, hint: string): AppealTypeDef => ({
  topic: "certificates", kind: "certificate", department: "docs", title, hint, slaDays: 1, fields: certFields,
});

const study = (kind: AppealKind, title: string, hint: string): AppealTypeDef => ({
  topic: "study", kind, department: "study", title, hint, slaDays: 2, fields: studyFields,
});

const stipend = (kind: AppealKind, title: string, hint: string): AppealTypeDef => ({
  topic: "stipend", kind, department: "stipend", title, hint, slaDays: 3, fields: stipendFields,
});

export const APPEAL_TYPES = {
  cert_study: certificate(
    "Справка об обучении",
    "Укажи, куда нужна справка и сколько экземпляров. Обычно готовим за 1 рабочий день, забрать можно в едином окне.",
  ),
  cert_military: certificate(
    "Справка для военкомата",
    "Нужны название военкомата и количество экземпляров. Готовим за 1 рабочий день, выдаём на бумаге в едином окне.",
  ),
  cert_social: certificate(
    "Справка для соцзащиты",
    "Укажи орган соцзащиты, куда несёшь справку. Срок изготовления — 1 рабочий день.",
  ),
  cert_benefit: certificate(
    "Справка для стипендии или пособия",
    "Напиши, для какой выплаты и в какой орган нужна справка. Срок — 1 рабочий день.",
  ),
  cert_grades: certificate(
    "Архивная справка (выписка оценок)",
    "Выписка оценок за все прошедшие семестры. Пока достаём данные из архива, срок до 1 рабочего дня.",
  ),
  study_retake: study(
    "application", "Пересдача",
    "Назови дисциплину и причину, по которой нужна пересдача. Учебный отдел отвечает в течение 2 рабочих дней.",
  ),
  study_individual_plan: study(
    "application", "Индивидуальный график",
    "Опиши, почему нужен свободный график (работа, болезнь, стажировка) и на какой период. Ответим в течение 2 рабочих дней.",
  ),
  study_transfer: study(
    "application", "Перевод",
    "Напиши, куда хочешь перевестись (группа, направление или форма обучения) и почему. Ответим в течение 2 рабочих дней.",
  ),
  study_academic_leave: study(
    "application", "Академический отпуск",
    "Опиши основание для отпуска и желаемый срок. Подтверждающие документы принесёшь в единое окно. Ответим за 2 рабочих дня.",
  ),
  study_other: study(
    "question", "Другой учебный вопрос",
    "Если нужного пункта нет в списке, опиши вопрос своими словами. Учебный отдел ответит в течение 2 рабочих дней.",
  ),
  stip_increased: stipend(
    "application", "Повышенная академическая стипендия",
    "Подаётся на сессию без троек и долгов, пока открыто окно приёма. Стипендиальный отдел отвечает за 3 рабочих дня.",
  ),
  stip_social: stipend(
    "application", "Социальная стипендия",
    "Укажи основание (категорию) и какие документы есть на руках. Оригиналы понадобятся в едином окне. Срок ответа — 3 рабочих дня.",
  ),
  stip_material_aid: stipend(
    "application", "Материальная помощь",
    "Опиши жизненную ситуацию, из-за которой нужна помощь. Рассматриваем в течение 3 рабочих дней.",
  ),
  stip_payment_question: stipend(
    "question", "Вопрос по выплате",
    "Напиши, за какой месяц и какая выплата вызвала вопрос. Стипендиальный отдел ответит за 3 рабочих дня.",
  ),
} satisfies Record<string, AppealTypeDef>;

export type AppealTypeCode = keyof typeof APPEAL_TYPES;
