import { BellOff } from "lucide-react";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";

// Пустой список уведомлений. total — сколько уведомлений у студента всего (прочитанных тоже).
export function NotificationsEmpty({ total, filter }: { total: number; filter: "all" | "unread" }) {
  return (
    <EmptyState
      icon={<BellOff />}
      title="Новых уведомлений нет"
      text={total > 0
        ? "Всё прочитано. Прочитанные уведомления — во вкладке «Все»."
        : "Когда деканат ответит или изменится расписание, уведомление появится здесь и на колокольчике."}
      action={total > 0 && filter === "unread"
        ? <Button href="/notifications" variant="secondary">Показать все</Button>
        : undefined}
    />
  );
}
