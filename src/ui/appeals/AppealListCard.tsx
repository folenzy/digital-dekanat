import Link from "next/link";
import type { AppealListItem } from "@/server/appeals/types";
import { studentHref } from "@/lib/hrefs";
import { StatusBadge } from "../StatusBadge";
import { appealPromise } from "../student/today";
import styles from "./AppealListCard.module.css";

// «Мои обращения» (на «Сегодня» и в «Деканате»): строки через линию, вся строка — ссылка.
// Слева — что это и куда ушло, справа — статус и что обещано. Обычный статус написан текстом;
// метку получает только то, что ждёт действия студента или уже решено (правило статусов, DESIGN.md).

export function AppealListCard({ appeal: a, now }: { appeal: AppealListItem; now: Date }) {
  const promise = appealPromise(a, now);
  return (
    <Link href={studentHref(a.id)} className={styles.item} data-attention={a.status === "needs_info" || undefined}>
      <span className={styles.what}>
        <span className={styles.title}>{a.type.title}</span>
        <span className={styles.sub}>
          <span className="sr-only">Обращение </span>
          <span className="num">{a.number}</span>, {a.department.name}
        </span>
      </span>
      <span className={styles.state}>
        <StatusBadge status={a.status} />
        <span className={styles.promise} data-tone={promise.tone}>{promise.text}</span>
      </span>
    </Link>
  );
}

/** Список обращений: линия сверху, строки через линию. */
export function AppealList({ appeals, now }: { appeals: readonly AppealListItem[]; now: Date }) {
  return (
    <ul className={styles.list}>
      {appeals.map((a) => (
        <li key={a.id}><AppealListCard appeal={a} now={now} /></li>
      ))}
    </ul>
  );
}
