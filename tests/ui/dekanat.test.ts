import { describe, expect, it } from "vitest";
import {
  fieldsFromForm, formValues, initialValues, parseWizardParams, STIPEND_TEMPLATE, wizardHref,
} from "@/app/(student)/dekanat/wizard";
import { appealFailureState, messageFailureText, writeToStaffHref } from "@/app/(student)/dekanat/form-state";
import { countdown } from "@/ui/appeals/time-left";
import { EVENT_LABEL, fieldRows, personShortName, slaPhrase, textLabel, TOPIC_META } from "@/ui/appeals/labels";

// Деканат: разбор адреса мастера, поля формы, тексты ошибок и сроков — чистые функции, без БД.

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
};

describe("мастер: параметры адреса", () => {
  it("без параметров — шаг 1", () => {
    expect(parseWizardParams({})).toEqual({ step: 1, text: "" });
  });

  it("тема → шаг 2, подтип → шаг 3 (тема берётся из подтипа)", () => {
    expect(parseWizardParams({ topic: "study" })).toEqual({ step: 2, topic: "study", text: "" });
    expect(parseWizardParams({ type: "cert_military" }))
      .toEqual({ step: 3, type: "cert_military", topic: "certificates", text: "", prefill: false });
    expect(parseWizardParams({ type: "stip_increased", topic: "study", prefill: "1" }))
      .toEqual({ step: 3, type: "stip_increased", topic: "stipend", text: "", prefill: true });
  });

  it("неизвестные и прототипные значения → на шаг назад", () => {
    expect(parseWizardParams({ type: "__proto__", topic: "constructor" }).step).toBe(1);
    expect(parseWizardParams({ type: "toString" }).step).toBe(1);
    expect(parseWizardParams({ type: "nope", topic: "stipend" })).toEqual({ step: 2, topic: "stipend", text: "" });
    expect(parseWizardParams({ topic: ["study", "stipend"] }).step).toBe(1); // повтор параметра — не строка
    expect(parseWizardParams({ type: "stip_increased", prefill: "true" })).toMatchObject({ prefill: false });
  });

  it("text: обрезка пробелов, не длиннее 2000, эмодзи не рвётся пополам", () => {
    expect(parseWizardParams({ text: "  вопрос  " })).toEqual({ step: 1, text: "вопрос" });
    expect((parseWizardParams({ text: "я".repeat(2500) }) as { text: string }).text).toHaveLength(2000);
    const cut = (parseWizardParams({ text: "a".repeat(1999) + "😀" }) as { text: string }).text;
    expect(cut).toBe("a".repeat(1999)); // половинку суррогатной пары не оставляем
  });

  it("ссылки мастера сохраняют текст", () => {
    expect(wizardHref({})).toBe("/dekanat/new");
    expect(wizardHref({ topic: "study", text: "" })).toBe("/dekanat/new?topic=study");
    expect(wizardHref({ type: "study_retake", text: "a&b" })).toBe("/dekanat/new?type=study_retake&text=a%26b");
  });
});

describe("мастер: начальные значения формы", () => {
  it("prefill=1 для повышенной стипендии — вежливый готовый текст", () => {
    expect(STIPEND_TEMPLATE).toMatch(/^Прошу рассмотреть возможность назначения/);
    expect(STIPEND_TEMPLATE.length).toBeGreaterThanOrEqual(10);
    expect(STIPEND_TEMPLATE.length).toBeLessThanOrEqual(2000);
    expect(initialValues("stip_increased", "", true)).toEqual({ text: STIPEND_TEMPLATE });
    expect(initialValues("stip_increased", "", false)).toEqual({ text: "" });
    expect(initialValues("stip_social", "", true)).toEqual({ text: "" }); // шаблон только для повышенной
  });

  it("текст из «Не помогло» — в поле текста; у справок — в комментарий (до 500)", () => {
    expect(initialValues("study_other", "мой вопрос", false)).toEqual({ text: "мой вопрос" });
    expect(initialValues("stip_increased", "свой текст", true)).toEqual({ text: "свой текст" });
    expect(initialValues("study_retake", "", false)).toEqual({ text: "", disciplineId: "" });
    expect(initialValues("cert_study", "x".repeat(800), false))
      .toEqual({ destination: "", copies: "1", format: "paper", comment: "x".repeat(500) });
  });
});

describe("мастер: поля из формы", () => {
  it("справка: число экземпляров — число, пустой комментарий не отправляется", () => {
    const form = fd({ destination: " В банк ", copies: "2", format: "electronic", comment: "  " });
    expect(fieldsFromForm("cert_study", form)).toEqual({ destination: " В банк ", copies: 2, format: "electronic" });
    expect(fieldsFromForm("cert_study", fd({ destination: "x", copies: "", comment: "срочно" })))
      .toEqual({ destination: "x", copies: undefined, format: undefined, comment: "срочно" });
    expect(fieldsFromForm("cert_study", fd({ copies: "abc" })).copies).toBeNaN();
  });

  it("пересдача: дисциплина — число; у других учебных вопросов игнорируется", () => {
    expect(fieldsFromForm("study_retake", fd({ text: "Нужна пересдача", disciplineId: "7" })))
      .toEqual({ text: "Нужна пересдача", disciplineId: 7 });
    expect(fieldsFromForm("study_retake", fd({ text: "Нужна пересдача", disciplineId: "" })))
      .toEqual({ text: "Нужна пересдача" });
    expect(fieldsFromForm("study_other", fd({ text: "Вопрос", disciplineId: "7" }))).toEqual({ text: "Вопрос" });
  });

  it("стипендия: только текст; лишние поля формы не попадают в обращение", () => {
    expect(fieldsFromForm("stip_payment_question", fd({ text: "Вопрос", studentId: "1", typeCode: "x" })))
      .toEqual({ text: "Вопрос" });
  });

  it("значения для повторного показа — строки полей подтипа", () => {
    expect(formValues("cert_study", fd({ destination: "x", copies: "3", format: "paper", evil: "1" })))
      .toEqual({ destination: "x", copies: "3", format: "paper", comment: "" });
    expect(formValues("study_retake", fd({ text: "t" }))).toEqual({ text: "t", disciplineId: "" });
  });
});

describe("тексты ошибок", () => {
  it("обращение: проверка полей, лимит, остальное", () => {
    const values = { text: "t" };
    expect(appealFailureState({ ok: false, error: "validation", fieldErrors: { text: "Минимум 10 символов" } }, values))
      .toEqual({ error: "Проверь отмеченные поля", fieldErrors: { text: "Минимум 10 символов" }, values });
    expect(appealFailureState({ ok: false, error: "rate_limited" }, values))
      .toEqual({ error: "Слишком много обращений за час — попробуй позже", fieldErrors: {}, values });
    expect(appealFailureState({ ok: false, error: "not_found" }, values).error)
      .toBe("Не получилось отправить, попробуй ещё раз");
    // ошибка не поля формы (тип, корень) — общий текст
    expect(appealFailureState({ ok: false, error: "validation", fieldErrors: { typeCode: "Выбери тип обращения" } }, values).error)
      .toBe("Выбери тип обращения");
  });

  it("сообщение: закрыто, лимит, проверка поля", () => {
    expect(messageFailureText({ ok: false, error: "closed" })).toBe("Обращение закрыто — написать в него нельзя");
    expect(messageFailureText({ ok: false, error: "rate_limited" }))
      .toBe("Слишком много сообщений, попробуй через несколько минут");
    expect(messageFailureText({ ok: false, error: "validation", fieldErrors: { text: "Заполни поле" } })).toBe("Заполни поле");
    expect(messageFailureText({ ok: false, error: "not_found" })).toBe("Не получилось отправить, попробуй ещё раз");
  });

  it("«Не помогло — написать сотруднику»: тема и вопрос в адресе", () => {
    expect(writeToStaffHref("certificates", "справка в военкомат"))
      .toBe("/dekanat/new?topic=certificates&text=%D1%81%D0%BF%D1%80%D0%B0%D0%B2%D0%BA%D0%B0+%D0%B2+%D0%B2%D0%BE%D0%B5%D0%BD%D0%BA%D0%BE%D0%BC%D0%B0%D1%82");
    expect(writeToStaffHref(undefined, "вопрос")).toBe("/dekanat/new?text=%D0%B2%D0%BE%D0%BF%D1%80%D0%BE%D1%81");
    expect(writeToStaffHref("unknown", "вопрос")).toBe("/dekanat/new?text=%D0%B2%D0%BE%D0%BF%D1%80%D0%BE%D1%81");
  });
});

describe("обратный отсчёт", () => {
  const due = new Date("2026-11-10T15:00:00Z"); // 18:00 МСК
  const before = (min: number) => new Date(due.getTime() - min * 60_000);

  it("осталось: минуты, часы с минутами, дни с часами", () => {
    expect(countdown(due, before(0.5))).toEqual({ text: "осталось меньше минуты", overdue: false });
    expect(countdown(due, before(25))).toEqual({ text: "осталось 25 мин", overdue: false });
    expect(countdown(due, before(5 * 60 + 12))).toEqual({ text: "осталось 5 ч 12 мин", overdue: false });
    expect(countdown(due, before(3 * 60))).toEqual({ text: "осталось 3 ч", overdue: false });
    expect(countdown(due, before(24 * 60))).toEqual({ text: "осталось 1 день", overdue: false });
    expect(countdown(due, before(2 * 24 * 60 + 3 * 60 + 40))).toEqual({ text: "осталось 2 дня 3 ч", overdue: false });
    expect(countdown(due, before(5 * 24 * 60))).toEqual({ text: "осталось 5 дней", overdue: false });
  });

  it("просрочено", () => {
    expect(countdown(due, due)).toEqual({ text: "срок наступил", overdue: false });
    expect(countdown(due, before(-0.5))).toEqual({ text: "просрочено меньше чем на минуту", overdue: true });
    expect(countdown(due, before(-130))).toEqual({ text: "просрочено на 2 ч 10 мин", overdue: true });
    expect(countdown(due, before(-(26 * 60)))).toEqual({ text: "просрочено на 1 день 2 ч", overdue: true });
  });
});

describe("подписи", () => {
  it("темы, срок подтипа, подпись поля текста", () => {
    expect(Object.keys(TOPIC_META)).toEqual(["certificates", "study", "stipend"]);
    expect(TOPIC_META.study.title).toBe("Учебные вопросы");
    expect(slaPhrase(1)).toBe("обычно отвечаем за 1 раб. день");
    expect(slaPhrase(2)).toBe("обычно отвечаем за 2 раб. дня");
    expect(slaPhrase(5)).toBe("обычно отвечаем за 5 раб. дней");
    expect(textLabel("application")).toBe("Текст заявления");
    expect(textLabel("question")).toBe("Твой вопрос");
  });

  it("короткое имя: сотрудник «Имя Фамилия», студент «Имя Фамилия»", () => {
    expect(personShortName("Ирина Николаевна Белова", "staff")).toBe("Ирина Белова");
    expect(personShortName("Миронова Алина Сергеевна", "student")).toBe("Алина Миронова");
    expect(personShortName("Кравцов Денис", "student")).toBe("Денис Кравцов");
    expect(personShortName("Ирина", "staff")).toBe("Ирина");
  });

  it("события таймлайна названы по-человечески", () => {
    expect(EVENT_LABEL.taken).toBe("Принято в работу");
    expect(EVENT_LABEL.submitted).toBe("Отправлено");
    expect(EVENT_LABEL.needs_info).toBe("Нужно уточнение");
  });

  it("поля обращения — с человеческими подписями, как ввёл автор", () => {
    const cert = { kind: "certificate" as const };
    expect(fieldRows({ type: cert, disciplineName: null,
      fields: { destination: "<b>военкомат</b>", copies: 2, format: "electronic", comment: "срочно" } }))
      .toEqual([
        { label: "Куда нужна справка", value: "<b>военкомат</b>" },
        { label: "Экземпляров", value: "2" },
        { label: "Формат", value: "Электронная, PDF с подписью" },
        { label: "Комментарий", value: "срочно" },
      ]);
    expect(fieldRows({ type: { kind: "application" }, disciplineName: "Статистика", fields: { text: "Хочу пересдать", disciplineId: 3 } }))
      .toEqual([{ label: "Дисциплина", value: "Статистика" }, { label: "Текст заявления", value: "Хочу пересдать" }]);
    expect(fieldRows({ type: { kind: "question" }, disciplineName: null, fields: { text: "Вопрос", extra: { a: 1 } } }))
      .toEqual([{ label: "Твой вопрос", value: "Вопрос" }]);
  });
});
