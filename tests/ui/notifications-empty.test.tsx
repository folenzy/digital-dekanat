import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationsEmpty } from "@/app/(student)/notifications/NotificationsEmpty";

// Пустой список уведомлений: понятный текст и действие, и никакого «0» из условного рендера.
const html = (total: number, filter: "all" | "unread") =>
  renderToStaticMarkup(<NotificationsEmpty total={total} filter={filter} />);

describe("NotificationsEmpty", () => {
  it("уведомлений нет вовсе: без кнопки и без «0»", () => {
    for (const filter of ["all", "unread"] as const) {
      const out = html(0, filter);
      expect(out).toContain("Новых уведомлений нет");
      expect(out).toContain("Когда деканат ответит");
      expect(out).not.toContain("Показать все");
      expect(out).not.toMatch(/>0</);
    }
  });

  it("всё прочитано, фильтр «Непрочитанные»: кнопка «Показать все»", () => {
    const out = html(5, "unread");
    expect(out).toContain("Новых уведомлений нет");
    expect(out).toContain("Всё прочитано");
    expect(out).toContain('href="/notifications"');
    expect(out).toContain("Показать все");
  });
});
