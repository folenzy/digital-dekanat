import { describe, expect, it } from "vitest";
import { parseQueueParams, queueHref } from "@/app/staff/params";
import {
  announcementFailureState, audienceFromForm, parsePickupUntil, staffFailure,
} from "@/app/staff/form-state";
import { shortCountdown } from "@/ui/appeals/time-left";
import {
  avgResponseText, PICKUP_MAX_DAYS, pickupDefaultKey, publishedText, QUEUE_TABS, tabOfStatus,
} from "@/ui/staff/labels";

// Кабинет сотрудника: адрес очереди, таймер срока, тексты ошибок и сводки — чистые функции, без БД.

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
};
const NOW = new Date("2026-11-10T07:00:00Z"); // вторник, 10:00 МСК
const plus = (min: number) => new Date(NOW.getTime() + min * 60_000);

describe("таймер срока в очереди", () => {
  it("осталось: минуты, часы до двух суток, дальше — дни", () => {
    expect(shortCountdown(plus(21 * 60 + 10), NOW)).toEqual({
      label: "осталось", value: "21 ч", text: "осталось 21 ч", overdue: false,
    });
    expect(shortCountdown(plus(40), NOW).text).toBe("осталось 40 мин");
    expect(shortCountdown(plus(47 * 60 + 59), NOW).text).toBe("осталось 47 ч");
    expect(shortCountdown(plus(50 * 60), NOW).text).toBe("осталось 2 дня");
    expect(shortCountdown(plus(5 * 24 * 60 + 3), NOW).text).toBe("осталось 5 дней");
  });

  it("просрочено: «просрочено на 2 ч», меньше минуты — «1 мин»", () => {
    expect(shortCountdown(plus(-(2 * 60 + 10)), NOW)).toEqual({
      label: "просрочено на", value: "2 ч", text: "просрочено на 2 ч", overdue: true,
    });
    expect(shortCountdown(new Date(NOW.getTime() - 30_000), NOW).text).toBe("просрочено на 1 мин");
    expect(shortCountdown(plus(-(3 * 24 * 60)), NOW).text).toBe("просрочено на 3 дня");
  });
});

describe("адрес очереди", () => {
  const deps = [1, 2, 3];

  it("по умолчанию — «Новые», все отделы", () => {
    expect(parseQueueParams({}, deps)).toEqual({ tab: "new", dept: undefined });
  });

  it("вкладка из адреса; мусор, прототипные ключи и массивы → «Новые»", () => {
    expect(parseQueueParams({ tab: "waiting" }, deps).tab).toBe("waiting");
    expect(parseQueueParams({ tab: "closed" }, deps).tab).toBe("closed");
    expect(parseQueueParams({ tab: "__proto__" }, deps).tab).toBe("new");
    expect(parseQueueParams({ tab: "toString" }, deps).tab).toBe("new");
    expect(parseQueueParams({ tab: ["closed", "new"] }, deps).tab).toBe("new");
  });

  it("отдел — только из своих; чужой и кривой → все отделы", () => {
    expect(parseQueueParams({ dept: "2" }, deps).dept).toBe(2);
    expect(parseQueueParams({ dept: "7" }, deps).dept).toBeUndefined();
    expect(parseQueueParams({ dept: "2abc" }, deps).dept).toBeUndefined();
    expect(parseQueueParams({ dept: "-1" }, deps).dept).toBeUndefined();
    expect(parseQueueParams({ dept: "1e0" }, deps).dept).toBeUndefined();
    expect(parseQueueParams({ dept: ["1"] }, deps).dept).toBeUndefined();
    expect(parseQueueParams({ dept: "2" }, []).dept).toBeUndefined();
  });

  it("ссылка: вкладка «Новые» и «все отделы» не пишутся в адрес", () => {
    expect(queueHref({ tab: "new" })).toBe("/staff");
    expect(queueHref({ tab: "closed" })).toBe("/staff?tab=closed");
    expect(queueHref({ tab: "new", dept: 2 })).toBe("/staff?dept=2");
    expect(queueHref({ tab: "waiting", dept: 3 })).toBe("/staff?tab=waiting&dept=3");
  });

  it("вкладка по статусу обращения", () => {
    expect(tabOfStatus("submitted")).toBe("new");
    expect(tabOfStatus("in_progress")).toBe("in_progress");
    expect(tabOfStatus("needs_info")).toBe("waiting");
    expect(tabOfStatus("ready")).toBe("closed");
    expect(tabOfStatus("rejected")).toBe("closed");
    expect(tabOfStatus("closed")).toBe("closed");
  });

  it("вкладки: подписи по спеке и пустые состояния", () => {
    expect(QUEUE_TABS.map((t) => [t.tab, t.label])).toEqual([
      ["new", "Новые"], ["in_progress", "В работе"], ["waiting", "Ждут студента"], ["closed", "Закрытые"],
    ]);
    expect(QUEUE_TABS[0].emptyTitle).toBe("Новых обращений нет");
  });
});

describe("сводка", () => {
  it("среднее время первого ответа человеческими словами", () => {
    expect(avgResponseText(null)).toBe("—");
    expect(avgResponseText(0)).toBe("до 3 мин");
    expect(avgResponseText(0.7)).toBe("42 мин");
    expect(avgResponseText(1)).toBe("1 ч");
    expect(avgResponseText(1.5)).toBe("1,5 ч");
    expect(avgResponseText(26.3)).toBe("26,3 ч");
  });

  it("«Опубликовано: увидят N студентов» с правильными формами", () => {
    expect(publishedText(1)).toBe("Опубликовано: увидит 1 студент");
    expect(publishedText(3)).toBe("Опубликовано: увидят 3 студента");
    expect(publishedText(5)).toBe("Опубликовано: увидят 5 студентов");
    expect(publishedText(21)).toBe("Опубликовано: увидит 21 студент");
    expect(publishedText(0)).toBe("Опубликовано. В этой аудитории пока нет студентов");
  });
});

describe("место и срок выдачи справки", () => {
  it("по умолчанию — через 5 дней, выходной сдвигается на понедельник (по Москве)", () => {
    expect(pickupDefaultKey(new Date("2026-11-08T09:00:00Z"))).toBe("2026-11-13"); // вс → пт
    expect(pickupDefaultKey(new Date("2026-11-09T09:00:00Z"))).toBe("2026-11-16"); // пн → сб → пн
    expect(pickupDefaultKey(NOW)).toBe("2026-11-16"); // вт → вс → пн
    expect(pickupDefaultKey(new Date("2026-11-08T22:30:00Z"))).toBe("2026-11-16"); // уже понедельник по Москве
  });

  it("дата из поля → 17:00 МСК этого дня", () => {
    expect(parsePickupUntil("2026-11-13", NOW)).toEqual({ until: new Date("2026-11-13T14:00:00Z") });
    // прошлое не отсекаем здесь: сервер ответит «Срок выдачи должен быть позже текущего момента»
    expect(parsePickupUntil("2026-11-01", NOW)).toEqual({ until: new Date("2026-11-01T14:00:00Z") });
  });

  it("кривая дата и слишком далёкий срок → ошибка поля", () => {
    for (const bad of ["", "abc", "2026-02-30", "2026-13-01", "13.11.2026", "2026-11-13T10:00"]) {
      expect(parsePickupUntil(bad, NOW)).toEqual({ error: "Укажи дату" });
    }
    expect(PICKUP_MAX_DAYS).toBe(90);
    expect(parsePickupUntil("2027-02-08", NOW)).toEqual({ until: new Date("2027-02-08T14:00:00Z") }); // +90
    expect(parsePickupUntil("2027-02-09", NOW)).toEqual({ error: "Срок выдачи — не дальше чем через 90 дней" });
  });
});

describe("ошибки действий сотрудника", () => {
  it("коды Result → русский текст", () => {
    expect(staffFailure({ ok: false, error: "bad_transition" })).toEqual({
      error: "Статус уже изменился — обнови страницу", fieldErrors: {},
    });
    expect(staffFailure({ ok: false, error: "closed" }).error).toBe("Обращение закрыто — написать в него нельзя");
    expect(staffFailure({ ok: false, error: "rate_limited" }).error)
      .toBe("Слишком много сообщений — попробуй через несколько минут");
    expect(staffFailure({ ok: false, error: "not_found" }).error)
      .toBe("Обращение не найдено — вернись в очередь и открой его заново");
  });

  it("validation: ошибки у полей, общий текст — только для ошибки не про поле", () => {
    expect(staffFailure({ ok: false, error: "validation", fieldErrors: { reason: "Минимум 5 символов" } }))
      .toEqual({ error: "", fieldErrors: { reason: "Минимум 5 символов" } });
    expect(staffFailure({ ok: false, error: "validation", fieldErrors: { _form: "Проверь значение" } }))
      .toEqual({ error: "Проверь значение", fieldErrors: { _form: "Проверь значение" } });
    expect(staffFailure({ ok: false, error: "validation" }).error).toBe("Не получилось сохранить, попробуй ещё раз");
  });
});

describe("аудитория объявления из формы", () => {
  it("всем / факультет / курс / группа — берётся только выбранное", () => {
    expect(audienceFromForm(fd({ audience: "all", facultyId: "1" }))).toEqual({ audience: {} });
    expect(audienceFromForm(fd({ audience: "faculty", facultyId: "2", groupId: "3" })))
      .toEqual({ audience: { facultyId: 2 } });
    expect(audienceFromForm(fd({ audience: "course", course: "2" }))).toEqual({ audience: { course: 2 } });
    expect(audienceFromForm(fd({ audience: "group", groupId: "4", course: "1" }))).toEqual({ audience: { groupId: 4 } });
  });

  it("не выбрано значение или аудитория — ошибка у своего поля", () => {
    expect(audienceFromForm(fd({ audience: "group" })))
      .toEqual({ fieldErrors: { "audience.groupId": "Выбери группу" } });
    expect(audienceFromForm(fd({ audience: "faculty", facultyId: "x" })))
      .toEqual({ fieldErrors: { "audience.facultyId": "Выбери факультет" } });
    expect(audienceFromForm(fd({ audience: "course", course: "7" })))
      .toEqual({ fieldErrors: { "audience.course": "Выбери курс" } });
    expect(audienceFromForm(fd({}))).toEqual({ fieldErrors: { audience: "Выбери, кому адресовано объявление" } });
    expect(audienceFromForm(fd({ audience: "__proto__" })))
      .toEqual({ fieldErrors: { audience: "Выбери, кому адресовано объявление" } });
  });

  it("ошибки публикации", () => {
    const values = { title: "Т" };
    expect(announcementFailureState({ ok: false, error: "rate_limited" }, values)).toMatchObject({
      ok: false, error: "Слишком много объявлений за час — попробуй позже", fieldErrors: {}, values,
    });
    expect(announcementFailureState({ ok: false, error: "validation", fieldErrors: { title: "Минимум 3 символа" } }, values))
      .toMatchObject({ ok: false, error: "Проверь отмеченные поля", fieldErrors: { title: "Минимум 3 символа" } });
  });
});

describe("поля обращения глазами сотрудника", () => {
  it("вопрос — «Вопрос студента», а не «Твой вопрос»; заявление — как у студента", async () => {
    const { fieldRows } = await import("@/ui/appeals/labels");
    const q = { fields: { text: "Когда стипендия?" }, disciplineName: null, type: { kind: "question" as const } };
    expect(fieldRows(q, "staff")).toEqual([{ label: "Вопрос студента", value: "Когда стипендия?" }]);
    expect(fieldRows(q)).toEqual([{ label: "Твой вопрос", value: "Когда стипендия?" }]);
    const app = { fields: { text: "Прошу" }, disciplineName: "Статистика", type: { kind: "application" as const } };
    expect(fieldRows(app, "staff")).toEqual([
      { label: "Дисциплина", value: "Статистика" }, { label: "Текст заявления", value: "Прошу" },
    ]);
  });
});
