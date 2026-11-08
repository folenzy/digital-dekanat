import type { AppealEventView } from "@/server/appeals/types";
import { ruWhen } from "@/server/format";
import { EVENT_LABEL, personShortName } from "./labels";
import styles from "./Timeline.module.css";

// «Путь обращения» — как трек посылки: пройденные остановки сверху вниз, последняя отмечена,
// следующая (если известна) — пунктиром. Текст события показываем только там, где его нет в переписке:
// причина отказа и где забрать справку. Вопрос-уточнение и ответы — в переписке.

const SHOWN_TEXT = new Set(["ready", "rejected"]);

type TimelineProps = {
  events: AppealEventView[];
  now: Date;
  /** Следующая остановка: «Ответ до завтра, 18:00». */
  next?: string;
};

export function Timeline({ events, now, next }: TimelineProps) {
  const last = events.length - 1;
  return (
    <ol className={styles.track} data-surface="paper">
      {events.map((e, i) => (
        <li key={`${e.kind}-${+e.at}-${i}`} className={styles.stop} data-kind={e.kind} data-current={i === last || undefined}>
          <span className={styles.dot} aria-hidden="true" />
          <div className={styles.body}>
            <p className={styles.title}>{EVENT_LABEL[e.kind]}</p>
            <p className={styles.meta}>
              <time dateTime={e.at.toISOString()}>{ruWhen(e.at, now)}</time>
              {e.actorName && <> · {personShortName(e.actorName, e.actor === "staff" ? "staff" : "student")}</>}
            </p>
            {e.text && SHOWN_TEXT.has(e.kind) && <p className={styles.text}>{e.text}</p>}
          </div>
        </li>
      ))}
      {next && (
        <li className={styles.stop} data-next="">
          <span className={styles.dot} aria-hidden="true" />
          <div className={styles.body}>
            <p className={styles.title}><span className="sr-only">Дальше: </span>{next}</p>
          </div>
        </li>
      )}
    </ol>
  );
}
