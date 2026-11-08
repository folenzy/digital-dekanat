import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QueueItem } from "@/server/appeals/types";
import { QueueCard } from "@/ui/staff/QueueCard";

// Талон очереди сотрудника: корешок с таймером только у идущего срока, просрочка помечена, текст экранирован.

const NOW = new Date("2026-11-10T09:00:00Z"); // вторник, 12:00 МСК
const base: QueueItem = {
  id: "11111111-1111-4111-8111-111111111111",
  number: "О-2026-000007",
  type: { code: "stip_payment_question", title: "Вопрос по выплате", topic: "stipend", kind: "question" },
  department: { id: 3, code: "stipend", name: "Стипендиальный отдел" },
  status: "submitted",
  slaDueAt: new Date("2026-11-11T15:00:00Z"),
  overdue: false,
  createdAt: new Date("2026-11-10T07:30:00Z"),
  updatedAt: new Date("2026-11-10T07:30:00Z"),
  assignee: null,
  student: { fullName: "Соколова Милана Андреевна", group: "ЭК-24-1" },
};
const html = (a: Partial<QueueItem>) => renderToStaticMarkup(<QueueCard appeal={{ ...base, ...a }} now={NOW} />);

describe("QueueCard", () => {
  it("новое: ссылка на карточку, номер, отдел, студент с группой, статус, таймер и срок", () => {
    const out = html({});
    expect(out).toContain('href="/staff/appeals/11111111-1111-4111-8111-111111111111"');
    expect(out).toContain("О-2026-000007");
    expect(out).toContain("Стипендиальный отдел");
    expect(out).toContain("Соколова Милана Андреевна, ЭК-24-1");
    expect(out).toContain("Отправлено");
    expect(out).toContain("поступило сегодня, 10:30");
    expect(out).toMatch(/осталось<\/span> <span[^>]*>30 ч<\/span>/);
    expect(out).toContain("до завтра, 18:00");
    expect(out).not.toContain("data-overdue");
  });

  it("просрочено: метка на талоне и на таймере, «просрочено на»", () => {
    const out = html({ status: "in_progress", overdue: true, slaDueAt: new Date("2026-11-10T06:50:00Z"), assignee: "Ирина Николаевна Белова" });
    expect(out).toMatch(/<a[^>]*data-overdue="true"/);
    expect(out).toMatch(/<time[^>]*data-overdue="true"/);
    expect(out).toMatch(/просрочено на<\/span> <span[^>]*>2 ч<\/span>/);
    expect(out).toContain("ведёт Ирина Белова");
  });

  it("ждёт студента и закрытые — без корешка-таймера: срок не идёт", () => {
    const waiting = html({ status: "needs_info", updatedAt: new Date("2026-11-09T16:50:00Z") });
    expect(waiting).not.toContain("<time");
    expect(waiting).toContain("вопрос задан вчера, 19:50");
    const closed = html({ status: "rejected", updatedAt: new Date("2026-11-10T08:00:00Z") });
    expect(closed).not.toContain("<time");
    expect(closed).toContain("Отклонено");
    expect(closed).toContain("сегодня, 11:00");
  });

  it("текст из БД экранирован", () => {
    const out = html({ student: { fullName: "<b>Тест</b>", group: "ЭК-24-1" } });
    expect(out).toContain("&lt;b&gt;Тест&lt;/b&gt;");
    expect(out).not.toContain("<b>Тест</b>");
  });
});
