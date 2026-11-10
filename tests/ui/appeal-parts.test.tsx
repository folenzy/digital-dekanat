import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppealEventView, AppealMessageView } from "@/server/appeals/types";
import { FieldsSummary } from "@/ui/appeals/FieldsSummary";
import { Thread } from "@/ui/appeals/Thread";
import { Timeline } from "@/ui/appeals/Timeline";

// Части карточки обращения (общие для студента и сотрудника): разметка, экранирование, чьё сообщение справа.
const html = (el: ReactElement) => renderToStaticMarkup(el);
const NOW = new Date("2026-11-10T12:00:00Z");
const at = (h: number) => new Date(`2026-11-10T${String(h).padStart(2, "0")}:00:00Z`);

describe("Timeline", () => {
  const events: AppealEventView[] = [
    { kind: "submitted", text: null, at: at(7), actor: "student", actorName: "Миронова Алина Сергеевна" },
    { kind: "taken", text: "Принято в работу", at: at(8), actor: "staff", actorName: "Ирина Николаевна Белова" },
    { kind: "needs_info", text: "Какой военкомат?", at: at(9), actor: "staff", actorName: "Ирина Николаевна Белова" },
    { kind: "rejected", text: "<b>Нет</b> оснований", at: at(10), actor: "staff", actorName: "Ирина Николаевна Белова" },
  ];

  it("остановки с временем и коротким именем; последняя отмечена; следующая — пунктиром", () => {
    const out = html(<Timeline events={events.slice(0, 2)} now={NOW} next="Ответ до завтра, 18:00" />);
    expect(out).toContain("Отправлено");
    expect(out).toContain("сегодня, 10:00</time> · Алина Миронова");
    expect(out).toContain("Принято в работу");
    expect(out).toContain("сегодня, 11:00</time> · Ирина Белова");
    expect(out).toMatch(/data-kind="taken" data-current="true"/);
    expect(out).toContain('<span class="sr-only">Дальше: </span>Ответ до завтра, 18:00');
  });

  it("текст события — только причина отказа и место выдачи (вопрос — в переписке), экранирован", () => {
    const out = html(<Timeline events={events} now={NOW} />);
    expect(out).not.toContain("Какой военкомат?");
    expect(out).toContain("&lt;b&gt;Нет&lt;/b&gt; оснований");
    expect(out).not.toContain("<b>Нет</b>");
  });
});

describe("Thread", () => {
  const messages: AppealMessageView[] = [
    { id: 1, body: "Какой военкомат?", at: at(9), author: "staff", authorName: "Ирина Николаевна Белова" },
    { id: 2, body: "<script>alert(1)</script> 😀", at: at(10), author: "student", authorName: "Миронова Алина Сергеевна" },
  ];

  it("свои сообщения справа (data-mine), автор и время; текст экранирован", () => {
    const student = html(<Thread messages={messages} now={NOW} mine="student" />);
    expect(student).toMatch(/data-author="student" data-mine="true"/);
    expect(student).not.toMatch(/data-author="staff" data-mine/);
    expect(student).toContain("Ирина Белова");
    expect(student).toContain("Алина Миронова");
    expect(student).toContain("&lt;script&gt;alert(1)&lt;/script&gt; 😀");
    expect(student).not.toContain("<script>");

    const staff = html(<Thread messages={messages} now={NOW} mine="staff" />);
    expect(staff).toMatch(/data-author="staff" data-mine="true"/);
  });
});

describe("FieldsSummary", () => {
  it("подписи по-человечески, значения экранированы; пусто — ничего", () => {
    const out = html(<FieldsSummary appeal={{
      type: { code: "cert_military", title: "Справка для военкомата", topic: "certificates", kind: "certificate" },
      disciplineName: null, fields: { destination: "<i>военкомат</i>", copies: 1, format: "paper" },
    }} />);
    expect(out).toContain("Куда нужна справка");
    expect(out).toContain("&lt;i&gt;военкомат&lt;/i&gt;");
    expect(out).toContain("На бумаге, с печатью");
    expect(html(<FieldsSummary appeal={{
      type: { code: "study_other", title: "Другой", topic: "study", kind: "question" }, disciplineName: null, fields: {},
    }} />)).toBe("");
  });
});
