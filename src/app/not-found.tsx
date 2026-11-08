import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { getViewer } from "@/server/auth/viewer";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { PublicPage } from "@/ui/PublicPage";

export const metadata: Metadata = { title: "Страница не найдена" };

// 404 для всего приложения: неизвестный адрес, чужое или несуществующее (notFound()).
// «На главную» — своя для роли: у сотрудника главная — очередь (студенческая «/» для него тоже 404).
export default async function NotFound() {
  const viewer = await getViewer();
  const home = viewer?.role === "staff" ? "/staff" : "/";
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
