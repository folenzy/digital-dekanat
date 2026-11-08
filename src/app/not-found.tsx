import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { getViewerForPublicPage } from "@/server/auth/viewer";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { homeHref } from "@/ui/nav";
import { PublicPage } from "@/ui/PublicPage";

export const metadata: Metadata = { title: "Страница не найдена" };

// 404 для всего приложения: неизвестный адрес, чужое или несуществующее (notFound()).
// «На главную» — своя для роли: у сотрудника главная — очередь (студенческая «/» для него тоже 404).
// Не удалось узнать, кто смотрит (сбой БД), — ссылка как для анонима, а сама 404 всё равно показывается.
export default async function NotFound() {
  const home = homeHref((await getViewerForPublicPage())?.role ?? null);
  return (
    <PublicPage home={home}>
      <EmptyState
        icon={<Compass />}
        titleAs="h1"
        title="Страница не найдена"
        text="Возможно, ссылка устарела или в адресе опечатка. Всё нужное — на главной."
        action={<Button href={home}>На главную</Button>}
      />
    </PublicPage>
  );
}
