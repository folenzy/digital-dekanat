import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { PublicPage } from "@/ui/PublicPage";

export const metadata: Metadata = { title: "Страница не найдена" };

// 404 для всего приложения: неизвестный адрес, чужое или несуществующее (notFound()).
export default function NotFound() {
  return (
    <PublicPage>
      <EmptyState
        icon={<Compass />}
        titleAs="h1"
        title="Страница не найдена"
        text="Возможно, ссылка устарела или в адресе опечатка. Всё нужное — на главной."
        action={<Button href="/">На главную</Button>}
      />
    </PublicPage>
  );
}
