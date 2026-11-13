import Link from "next/link";
import type { QueueItem } from "@/server/appeals/types";
import { mskTime, ruRelativeDate, ruWhen } from "@/server/format";
import { staffHref } from "@/lib/hrefs";
import { personShortName } from "../appeals/labels";
import { STATUS_META } from "../StatusBadge";
import { QueueTimer } from "./QueueTimer";
import styles from "./QueueRow.module.css";

// Строка очереди сотрудника. На рабочем столе — строка таблицы (срок, обращение, отдел, состояние, номер),
// на телефоне — запись в две-три строки. Вся строка — ссылка на обращение (GOV.UK Task list).
// Первая графа отвечает на главный вопрос сотрудника: сколько осталось. Пока срок идёт — таймер;
// просрочка красит графу и ставит красную метку у края строки. Когда срок не идёт, там итог или «ждём студента».
// Статус в строке не повторяется, если он у всей вкладки один: для скринридера он остаётся текстом.

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

/** Заголовки граф — для шапки таблицы на странице (видна только на широком экране). */
export function queueColumns(closed: boolean): string[] {
  return [closed ? "Итог" : "Срок", "Обращение", "Отдел", closed ? "Когда" : "Состояние", "Номер"];
}

export function QueueHead({ closed }: { closed: boolean }) {
  // Шапка — зрительная подсказка: у каждой ячейки строки смысл понятен из текста, поэтому от скринридера скрыта
  return (
    <div className={styles.head} aria-hidden="true">
      {queueColumns(closed).map((c) => <span key={c}>{c}</span>)}
    </div>
  );
}

export function QueueRow({ appeal: a, now }: { appeal: QueueItem; now: Date }) {
  const running = a.status === "submitted" || a.status === "in_progress";
  const status = STATUS_META[a.status].label;
  return (
    <Link href={staffHref(a.id)} className={styles.row} data-overdue={a.overdue || undefined}>
      <span className={styles.due}>
        {running ? (
          <>
            <QueueTimer due={a.slaDueAt.toISOString()} serverNow={now.toISOString()} />
            <span className={styles.dueDate}>
              до {ruRelativeDate(a.slaDueAt, now)}, {mskTime(a.slaDueAt)}
            </span>
          </>
        ) : (
          <span className={styles.outcome} data-status={a.status}>
            {a.status === "needs_info" ? "ждём студента" : status}
          </span>
        )}
      </span>
      <div className={styles.what}>
        <h3 className={styles.title}>{a.type.title}</h3>
        <span className={styles.student}>{a.student.fullName}, {a.student.group}</span>
      </div>
      <span className={styles.meta}>
        <span className={styles.dept} title={a.department.name}>{a.department.name}</span>
        <span className={styles.note}>
          {running && <span className="sr-only">{status}, </span>}
          {note(a, now)}
        </span>
      </span>
      <span className={`${styles.number} num`}>{a.number}</span>
    </Link>
  );
}
