import type { ReactNode } from "react";
import { pairName, shortPersonName } from "@/server/format";
import type { Lesson } from "@/server/schedule";
import { Badge } from "../Badge";
import { buildingName, CHANGE_META, LESSON_TYPE_LABEL } from "./labels";
import { LESSON_TYPE_CODE } from "./schedule-view";
import styles from "./LessonCard.module.css";

// Карточка пары. Порядок чтения — как привыкли студенты:
//   [тип] [номер пары]                      время
//   Название дисциплины
//   ─────────────────────────────────────────────
//   аудитория                       преподаватель
// Тип занятия — цветная плашка с кодом (ЛК / ПР / ЛБ): цвет считывается с первого взгляда, код и полное
// название для скринридера страхуют тех, кто цвета не различает.
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
  const room = l.room === "уточняется" ? "аудитория уточняется" : `ауд. ${l.room}`;
  // «Корпус А» → «, корпус А»
  const building = l.building ? `, ${buildingName(l.building)}` : "";

  return (
    <article
      className={styles.lesson}
      data-surface="paper"
      data-type={l.type}
      data-state={state}
      data-cancelled={cancelled || undefined}
      data-compact={compact || undefined}
    >
      <div className={styles.top}>
        <span className={styles.type} data-type={l.type}>
          <span aria-hidden="true">{LESSON_TYPE_CODE[l.type]}</span>
          <span className="sr-only">{LESSON_TYPE_LABEL[l.type]}</span>
        </span>
        <span className={styles.pair}>{pairName(l.pair)}</span>
        <span className={`${styles.time} num`}>
          {was?.start && (
            <del className={styles.oldStart}>
              <span className="sr-only">было в </span>
              {was.start}
            </del>
          )}
          <span className={styles.range}>
            <span className={styles.start}>{l.start}</span>
            <span aria-hidden="true"> – </span>
            <span className="sr-only"> до </span>
            <span className={styles.end}>{l.end}</span>
          </span>
        </span>
      </div>

      {kicker && <p className={styles.kicker}>{kicker}</p>}
      <Title className={styles.title}>
        {cancelled ? <s>{l.discipline}</s> : l.discipline}
      </Title>

      <div className={styles.foot}>
        <p className={styles.room}>
          {was?.room ? <>ауд.{" "}<Was was={was.room} now={l.room} /></> : room}
          {building}
        </p>
        <p className={styles.teacher}>
          {was?.teacher ? <Was was={shortPersonName(was.teacher)} now={teacherName(l.teacher)} /> : teacherName(l.teacher)}
        </p>
      </div>

      {(change || state === "current" || state === "next") && (
        <p className={styles.badges}>
          {state === "current" && <Badge tone="accent">Идёт сейчас</Badge>}
          {state === "next" && <Badge tone="neutral">Следующая</Badge>}
          {change && <Badge tone={CHANGE_META[change.kind].tone}>{CHANGE_META[change.kind].label}</Badge>}
          {cancelled && change?.kind !== "cancelled" && <Badge tone="danger">Отменена</Badge>}
        </p>
      )}
      {change?.note && <p className={styles.note}>{change.note}</p>}
    </article>
  );
}
