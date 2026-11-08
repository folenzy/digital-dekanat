import type { AppealMessageView } from "@/server/appeals/types";
import { ruWhen } from "@/server/format";
import { personShortName } from "./labels";
import styles from "./Thread.module.css";

// Переписка внутри обращения. `mine` — чьи сообщения справа: у студента — свои, у сотрудника — деканата.
// Текст — как ввёл автор: React экранирует, pre-wrap сохраняет переносы, длинные слова переносятся.

type ThreadProps = {
  messages: AppealMessageView[];
  now: Date;
  mine: "student" | "staff";
};

export function Thread({ messages, now, mine }: ThreadProps) {
  return (
    <ol className={styles.thread}>
      {messages.map((m) => (
        <li key={m.id} className={styles.message} data-author={m.author} data-mine={m.author === mine || undefined}>
          <p className={styles.meta}>
            <span className={styles.author}>{personShortName(m.authorName, m.author)}</span>
            <time dateTime={m.at.toISOString()}>{ruWhen(m.at, now)}</time>
          </p>
          <div className={styles.bubble}>{m.body}</div>
        </li>
      ))}
    </ol>
  );
}
