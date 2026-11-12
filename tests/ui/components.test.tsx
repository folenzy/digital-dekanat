import { Inbox } from "lucide-react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/ui/AppShell";
import { Bell, badgeText, bellLabel, countsAsUnread } from "@/ui/Bell";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { CONCEPT_TEXT, ConceptBanner } from "@/ui/ConceptBanner";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState } from "@/ui/ErrorState";
import { Logo } from "@/ui/Logo";
import { PageHeader } from "@/ui/PageHeader";
import { Skeleton, SkeletonCard } from "@/ui/Skeleton";
import { STATUS_META, StatusBadge } from "@/ui/StatusBadge";
import { Toast } from "@/ui/Toast";

// Вне приложения роутера Next нет: оболочке (свайп между разделами) хватает заглушки с push.
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, prefetch: () => {} }),
}));

// Разметка компонентов на сервере (как их отдаёт Next): доступность и контракт, без браузера.
const html = (el: ReactElement) => renderToStaticMarkup(el);
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("StatusBadge", () => {
  it("русские подписи для всех статусов обращения", () => {
    expect(Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [k, v.label]))).toEqual({
      submitted: "Отправлено",
      in_progress: "В работе",
      needs_info: "Нужно уточнение",
      ready: "Готово",
      rejected: "Отклонено",
      closed: "Закрыто",
    });
  });

  it("статус виден текстом, не только цветом", () => {
    const out = html(<StatusBadge status="needs_info" />);
    expect(out).toContain("Нужно уточнение");
    expect(out).toContain('data-tone="warn"');
  });
});

describe("Bell", () => {
  it("счётчик растёт от уведомлений и объявлений, но не от простого обновления обращения", () => {
    expect(countsAsUnread({ type: "notification" })).toBe(true);
    expect(countsAsUnread({ type: "announcement" })).toBe(true);
    expect(countsAsUnread({ type: "appeal_updated" })).toBe(false);
  });

  it("бейдж: пусто при нуле, 99+ при большом числе", () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(7)).toBe("7");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(120)).toBe("99+");
  });

  it("aria-label с правильным склонением", () => {
    expect(bellLabel(0)).toBe("Уведомления, новых нет");
    expect(bellLabel(1)).toBe("Уведомления: 1 непрочитанное");
    expect(bellLabel(3)).toBe("Уведомления: 3 непрочитанных");
    expect(bellLabel(11)).toBe("Уведомления: 11 непрочитанных");
    expect(bellLabel(21)).toBe("Уведомления: 21 непрочитанное");
  });

  it("ссылка с подписью для скринридера, число на значке скрыто от него", () => {
    const out = html(<Bell initial={3} href="/notifications" />);
    expect(out).toContain('href="/notifications"');
    expect(out).toContain('aria-label="Уведомления: 3 непрочитанных"');
    expect(out).toMatch(/aria-hidden="true"[^>]*>3</);
  });
});

describe("Button", () => {
  it("по умолчанию type=button", () => {
    expect(html(<Button>Сохранить</Button>)).toContain('type="button"');
  });

  it("загрузка: заблокирована и помечена aria-busy", () => {
    const out = html(<Button loading>Отправить</Button>);
    expect(out).toContain('aria-busy="true"');
    expect(out).toMatch(/<button[^>]*disabled=""/);
    expect(out).toContain("Отправить");
  });

  it("с href — ссылка в том же оформлении", () => {
    const out = html(<Button href="/dekanat/new" variant="secondary">Написать в деканат</Button>);
    expect(out).toMatch(/^<a [^>]*href="\/dekanat\/new"/);
    expect(out).toContain('data-variant="secondary"');
  });
});

describe("состояния экранов", () => {
  it("ErrorState: объявляется сразу и даёт «Повторить»", () => {
    const out = html(<ErrorState retry={() => {}} />);
    expect(out).toContain('role="alert"');
    expect(out).toMatch(/<button[^>]*type="button"[^>]*>.*Повторить/);
  });

  it("EmptyState: заголовок, текст и действие", () => {
    const out = html(
      <EmptyState icon={<Inbox />} title="Активных обращений нет" text="Напиши, если нужна справка."
        action={<Button href="/dekanat/new">Написать в деканат</Button>} />,
    );
    expect(out).toMatch(/<h2[^>]*>Активных обращений нет<\/h2>/);
    expect(out).toContain("Напиши, если нужна справка.");
    expect(out).toContain('href="/dekanat/new"');
  });

  it("Skeleton скрыт от скринридера, SkeletonCard сообщает о загрузке", () => {
    expect(html(<Skeleton width="60%" />)).toContain('aria-hidden="true"');
    const card = html(<SkeletonCard />);
    expect(card).toContain('role="status"');
    expect(card).toContain("Загружаем");
  });
});

describe("Card, PageHeader, Toast, Logo, ConceptBanner", () => {
  it("тёмная карточка переключает поверхность, чтобы текст сохранял контраст", () => {
    expect(html(<Card variant="ink">x</Card>)).toContain('data-surface="ink"');
    expect(html(<Card>x</Card>)).toContain('data-surface="paper"');
    expect(html(<Card href="/dekanat/1" title="Справка">x</Card>)).toMatch(/^<a [^>]*href="\/dekanat\/1"/);
  });

  it("PageHeader: заголовок страницы — h1", () => {
    const out = html(<PageHeader kicker="Воскресенье, 8 ноября" title="Доброе утро, Алина" subtitle="Две пары" />);
    expect(out).toMatch(/<h1[^>]*>Доброе утро, Алина<\/h1>/);
    expect(out).toContain("Воскресенье, 8 ноября");
    expect(out).toContain("Две пары");
  });

  it("Toast: кнопка закрытия подписана, ссылка «Открыть»", () => {
    const out = html(<Toast title="Деканат ответил" href="/dekanat/1" onClose={() => {}} />);
    expect(out).toContain('aria-label="Скрыть уведомление"');
    expect(out).toMatch(/href="\/dekanat\/1"[^>]*>Открыть/);
    expect(html(<Toast title="Новое объявление" />)).not.toContain("<button");
  });

  it("Logo: без подписи — картинка с именем, с подписью — текст «На связи»", () => {
    expect(html(<Logo wordmark={false} />)).toMatch(/role="img"[^>]*aria-label="На связи"/);
    const full = html(<Logo />);
    expect(full).toContain("На связи");
    expect(full).toContain('aria-hidden="true"');
  });

  it("ConceptBanner: пометка дословно", () => {
    expect(CONCEPT_TEXT).toBe("Концепт для конкурса · не официальный сервис");
    expect(html(<ConceptBanner />)).toContain(CONCEPT_TEXT);
  });
});

describe("AppShell", () => {
  it("студент: пометка, колокольчик, пять разделов, main и ссылка «к содержимому»", () => {
    const out = html(
      <AppShell role="student" userName="Алина Миронова" unread={2} live={false}>
        <p>контент</p>
      </AppShell>,
    );
    expect(out).toContain(CONCEPT_TEXT);
    expect(out).toContain('href="#main"');
    expect(out).toMatch(/<main[^>]*id="main"/);
    expect(out).toContain("<p>контент</p>");
    expect(out).toContain('href="/notifications"');
    expect(out).toContain('aria-label="Уведомления: 2 непрочитанных"');
    for (const href of ["/", "/schedule", "/study", "/dekanat", "/profile"]) {
      // нижняя навигация (мобайл) и боковая (≥ 1024 px)
      expect(count(out, `href="${href}"`)).toBeGreaterThanOrEqual(2);
    }
    expect(out).toContain("Алина Миронова");
  });

  it("сотрудник: свои разделы, колокольчик ведёт в очередь", () => {
    const out = html(
      <AppShell role="staff" userName="Ирина Белова" unread={0} live={false}>
        <p>очередь</p>
      </AppShell>,
    );
    expect(out).toContain('href="/staff/announcements"');
    expect(out).toContain('href="/staff/profile"');
    expect(out).not.toContain('href="/schedule"');
    expect(out).toContain('aria-label="Уведомления, новых нет"');
  });
});
