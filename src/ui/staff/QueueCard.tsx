import Link from "next/link";
import type { QueueItem } from "@/server/appeals/types";
import { mskTime, ruRelativeDate, ruWhen } from "@/server/format";
import { personShortName } from "../appeals/labels";
import { StatusBadge } from "../StatusBadge";
import { QueueTimer } from "./QueueTimer";
import styles from "./QueueCard.module.css";

// Строка очереди сотрудника — талон электронной очереди: слева что и от кого, справа — отрывной корешок
// с таймером срока. Корешок есть, только пока срок идёт (Отправлено, В работе); просрочка красит
// корешок и край талона. Вся карточка — ссылка на обращение.

function note(a: QueueItem, now: Date): string {
  switch (a.status) {
    case "submitted":
      return `поступило ${ruWhen(a.createdAt, now)}`;
    case "in_progress":
      return a.assignee ? `ведёт ${personShortName(a.assignee, "staff")}` : "в работе";
    case "needs_info":
      return `вопрос задан ${ruWhen(a.updatedAt, now)}`;
    default:
      return ruWhen(a.updatedAt, now);
  }
}

export function QueueCard({ appeal: a, now }: { appeal: QueueItem; now: Date }) {
  const running = a.status === "submitted" || a.status === "in_progress";
  return (
    <Link href={`/staff/appeals/${a.id}`} className={styles.link} data-overdue={a.overdue || undefined}>
      <div className={styles.ticket} data-surface="paper" data-running={running || undefined}>
        <div className={styles.main}>
          <p className={styles.kicker}>
            <span className="num">{a.number}</span>
            <span className={styles.dept}>{a.department.name}</span>
          </p>
          <h3 className={styles.title}>{a.type.title}</h3>
          <p className={styles.student}>{a.student.fullName}, {a.student.group}</p>
          <div className={styles.meta}>
            <StatusBadge status={a.status} />
            <span>{note(a, now)}</span>
          </div>
        </div>
        {running && (
          <div className={styles.stub}>
            <QueueTimer due={a.slaDueAt.toISOString()} serverNow={now.toISOString()} />
            <span className={styles.due}>
              до {ruRelativeDate(a.slaDueAt, now)}, {mskTime(a.slaDueAt)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
