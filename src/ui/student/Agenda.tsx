import { shortPersonName } from "@/server/format";
import type { Lesson } from "@/server/schedule";
import { Badge } from "../Badge";
import { buildingName, CHANGE_META, LESSON_TYPE_LABEL } from "./labels";
import type { LessonState } from "./LessonCard";
import { LESSON_TYPE_CODE } from "./schedule-view";
import styles from "./Agenda.module.css";

// Лента дня на «Сегодня»: слева колонка времени, справа — что и где. Отвечает на вопрос «что сейчас
// и что дальше» одним взглядом (референс — Things Today). Подробный формат пары с перерывами живёт
// на странице «Пары» (LessonCard) — здесь сжатая сводка того же дня.
// Метка с подложкой — только у изменения и у идущей пары; «следующая» пишется текстом.

type AgendaProps = {
  lessons: readonly Lesson[];
  /** Состояние каждой пары по индексу; для не сегодняшнего дня не передаётся. */
  states?: readonly (LessonState | undefined)[];
  titleAs?: "h3" | "h4";
};

export function Agenda({ lessons, states, titleAs: Title = "h3" }: AgendaProps) {
  return (
    <ol className={styles.agenda}>
      {lessons.map((l, i) => {
        const state = states?.[i];
        const change = l.change;
        const cancelled = l.cancelled || change?.kind === "cancelled";
        const room = l.room === "уточняется" ? "аудитория уточняется" : `ауд. ${l.room}`;
        const building = l.building ? `, ${buildingName(l.building)}` : "";
        const teacher = l.teacher === "уточняется" ? "преподаватель уточняется" : shortPersonName(l.teacher);
        return (
          <li
            key={`${l.pair}-${l.discipline}`}
            className={styles.item}
            data-state={state}
            data-cancelled={cancelled || undefined}
          >
            <p className={`${styles.time} num`}>
              {change?.was?.start && (
                <del className={styles.oldStart}>
                  <span className="sr-only">было в </span>
                  {change.was.start}
                </del>
              )}
              <span className={styles.start}>{l.start}</span>
              <span className={styles.end}>
                <span className="sr-only"> до </span>
                {l.end}
              </span>
            </p>
            <div className={styles.body}>
              <Title className={styles.title}>{cancelled ? <s>{l.discipline}</s> : l.discipline}</Title>
              <p className={styles.meta}>
                <span className={styles.type} data-type={l.type}>
                  <span aria-hidden="true">{LESSON_TYPE_CODE[l.type]}</span>
                  <span className="sr-only">{LESSON_TYPE_LABEL[l.type]}, </span>
                </span>
                <span>{room}{building}, {teacher}</span>
              </p>
              {(change || cancelled || state === "current" || state === "next") && (
                <p className={styles.marks}>
                  {state === "current" && <Badge tone="accent">Идёт сейчас</Badge>}
                  {state === "next" && <span className={styles.next}>следующая</span>}
                  {change && <Badge tone={CHANGE_META[change.kind].tone}>{CHANGE_META[change.kind].label}</Badge>}
                  {cancelled && change?.kind !== "cancelled" && <Badge tone="danger">Отменена</Badge>}
                  {change?.note && <span className={styles.note}>{change.note}</span>}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
