import type { AppealListItem } from "@/server/appeals/types";
import { studentHref } from "@/lib/hrefs";
import { Card } from "../Card";
import { StatusBadge } from "../StatusBadge";
import { appealPromise } from "../student/today";
import styles from "./AppealListCard.module.css";

// Строка «Моих обращений» (на «Сегодня» и в «Деканате»): номер, подтип, статус, что обещано, отдел.
// Вся карточка — ссылка на обращение; «ждём твоего ответа» выделено терракотовой рамкой.

export function AppealListCard({ appeal: a, now }: { appeal: AppealListItem; now: Date }) {
  const promise = appealPromise(a, now);
  return (
    <Card
      href={studentHref(a.id)}
      variant={a.status === "needs_info" ? "accent" : "paper"}
      kicker={`Обращение ${a.number}`}
      title={a.type.title}
    >
      <div className={styles.row}>
        <StatusBadge status={a.status} />
        <span className={styles.promise} data-tone={promise.tone}>{promise.text}</span>
      </div>
      <p className={styles.dept}>{a.department.name}</p>
    </Card>
  );
}
