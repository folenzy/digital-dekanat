import { Fragment } from "react";
import type { Lesson } from "@/server/schedule";
import { LessonCard, type LessonState } from "./LessonCard";
import { gapBetween } from "./schedule-view";
import styles from "./LessonList.module.css";

// Список пар дня: карточки и строки «Перерыв · 10 мин» / «Окно · 2 ч 10 мин» между ними.

type LessonListProps = {
  lessons: readonly Lesson[];
  /** Состояние каждой пары (идёт, следующая, прошла) — по индексу; для не сегодняшних дней не передаётся. */
  states?: readonly (LessonState | undefined)[];
  compact?: boolean;
  titleAs?: "h2" | "h3" | "h4";
};

export function LessonList({ lessons, states, compact = false, titleAs }: LessonListProps) {
  return (
    <ol className={styles.list} data-compact={compact || undefined}>
      {lessons.map((l, i) => {
        const prev = lessons[i - 1];
        const gap = prev ? gapBetween(prev.end, l.start) : null;
        return (
          <Fragment key={`${l.pair}-${l.discipline}`}>
            {gap && (
              <li className={styles.gap} data-kind={gap.kind}>
                <span>{gap.label}</span>
                <span className="num">{gap.duration}</span>
              </li>
            )}
            <li>
              <LessonCard lesson={l} state={states?.[i]} compact={compact} titleAs={titleAs} />
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
