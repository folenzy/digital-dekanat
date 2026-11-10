import type { ReactNode } from "react";
import { pairName, shortPersonName } from "@/server/format";
import type { Lesson } from "@/server/schedule";
import { Badge } from "../Badge";
import { buildingName, CHANGE_META, LESSON_TYPE_LABEL } from "./labels";
import styles from "./LessonCard.module.css";

// Карточка пары: время крупно (как в ежедневнике), дисциплина, тип и номер пары, аудитория, преподаватель.
// Изменения — бейдж и «было → стало» (старое зачёркнуто). Идущая пара отмечена закладкой-ляссе.

export type LessonState = "current" | "next" | "past";

type LessonCardProps = {
  lesson: Lesson;
  state?: LessonState;
  /** Строка над названием, например «Следующая · завтра». */
  kicker?: ReactNode;
  titleAs?: "h2" | "h3" | "h4";
  /** Плотнее — для недели. */
  compact?: boolean;
};

/** «было X → стало Y»: для глаз — зачёркнутое и стрелка, для скринридера — слова «было» и «стало». */
function Was({ was, now }: { was: string; now: string }) {
  return (
    <>
      <del className={styles.was}>
        <span className="sr-only">было </span>
        {was}
      </del>
      <span aria-hidden="true" className={styles.arrow}> → </span>
      <span className="sr-only">, стало </span>
      <span className={styles.now}>{now}</span>
    </>
  );
}

const teacherName = (name: string) => (name === "уточняется" ? "преподаватель уточняется" : shortPersonName(name));

export function LessonCard({ lesson: l, state, kicker, titleAs: Title = "h3", compact = false }: LessonCardProps) {
  const change = l.change;
  const was = change?.was;
  const cancelled = l.cancelled || change?.kind === "cancelled";
  const room = l.room === "уточняется" ? "аудитория уточняется" : `ауд. ${l.room}`;
  // «Корпус А» → «, корпус А»
  const building = l.building ? `, ${buildingName(l.building)}` : "";

  return (
    <article
      className={styles.lesson}
      data-surface="paper"
      data-state={state}
      data-cancelled={cancelled || undefined}
      data-compact={compact || undefined}
    >
      <div className={styles.time}>
        <span className={`${styles.start} num`}>
          {was?.start ? <span className="sr-only">Начало: </span> : null}
          {l.start}
        </span>
        {was?.start && (
          <del className={styles.oldStart}>
            <span className="sr-only">было в </span>
            {was.start}
          </del>
        )}
        <span className={`${styles.end} num`}>
          <span className="sr-only">до </span>
          {l.end}
        </span>
      </div>

      <div className={styles.body}>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        <Title className={styles.title}>
          {cancelled ? <s>{l.discipline}</s> : l.discipline}
        </Title>
        <p className={styles.meta}>
          {pairName(l.pair)}, {LESSON_TYPE_LABEL[l.type].toLowerCase()}
        </p>
        <p className={styles.detail}>
          {was?.room ? <>ауд.{" "}<Was was={was.room} now={l.room} /></> : room}
          {building}
        </p>
        <p className={styles.detail}>
          {was?.teacher ? <Was was={shortPersonName(was.teacher)} now={teacherName(l.teacher)} /> : teacherName(l.teacher)}
        </p>

        {(change || state === "current" || state === "next") && (
          <p className={styles.badges}>
            {state === "current" && <Badge tone="accent">Идёт сейчас</Badge>}
            {state === "next" && <Badge tone="neutral">Следующая</Badge>}
            {change && <Badge tone={CHANGE_META[change.kind].tone}>{CHANGE_META[change.kind].label}</Badge>}
            {cancelled && change?.kind !== "cancelled" && <Badge tone="danger">Отменена</Badge>}
          </p>
        )}
        {change?.note && <p className={styles.note}>{change.note}</p>}
      </div>
    </article>
  );
}
