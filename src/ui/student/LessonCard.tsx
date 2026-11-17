import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { pairName, shortPersonName } from "@/server/format";
import type { Lesson } from "@/server/schedule";
import { Badge } from "../Badge";
import { buildingName, CHANGE_META, LESSON_TYPE_LABEL, MATERIAL_KIND_LABEL } from "./labels";
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
// Вся карточка — <details>: всё, что выше, лежит в <summary>, а подробности (полное ФИО, тема, задание,
// материалы) раскрываются на месте. Работает без JS; обработчиков касаний нет, чтобы не мешать листанию дней.

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
  const note = l.note;
  const cancelled = l.cancelled || change?.kind === "cancelled";
  const room = l.room === "уточняется" ? "аудитория уточняется" : `ауд. ${l.room}`;
  // «Корпус А» → «, корпус А»
  const building = l.building ? `, ${buildingName(l.building)}` : "";
  const hasBadges = Boolean(change || state === "current" || state === "next");
  const fullTeacher = l.teacher === "уточняется" ? "преподаватель уточняется" : l.teacher;

  return (
    <div>
      {/* Заголовок для навигации по заголовкам: внутри summary (роль button) он потерял бы семантику */}
      <Title className="sr-only">
        {l.discipline}, {l.start}–{l.end}
      </Title>
      <details
        className={styles.lesson}
        data-surface="paper"
        data-type={l.type}
        data-state={state}
        data-cancelled={cancelled || undefined}
        data-compact={compact || undefined}
      >
        <summary
          className={styles.summary}
        >
          <span className={styles.top}>
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
            <ChevronDown aria-hidden="true" className={styles.chevron} size={18} />
          </span>

          {kicker && <span className={styles.kicker}>{kicker}</span>}
          <span className={styles.title}>
            {cancelled ? <s>{l.discipline}</s> : l.discipline}
          </span>

          <span className={styles.foot}>
            <span className={styles.room}>
              {was?.room ? <>ауд.{" "}<Was was={was.room} now={l.room} /></> : room}
              {building}
            </span>
            {/* В недельной строке преподавателя нет: он в раскрытой части */}
            {!compact && (
              <span className={styles.teacher}>
                {was?.teacher ? <Was was={teacherName(was.teacher)} now={teacherName(l.teacher)} /> : teacherName(l.teacher)}
              </span>
            )}
          </span>

          {hasBadges && (
            <span className={styles.badges}>
              {state === "current" && <Badge tone="accent">Идёт сейчас</Badge>}
              {state === "next" && <Badge tone="neutral">Следующая</Badge>}
              {change && <Badge tone={CHANGE_META[change.kind].tone}>{CHANGE_META[change.kind].label}</Badge>}
              {cancelled && change?.kind !== "cancelled" && <Badge tone="danger">Отменена</Badge>}
            </span>
          )}
          {change?.note && <span className={styles.note}>{change.note}</span>}
        </summary>

        <div className={styles.details}>
          <p className={styles.row}>
            <span className={styles.label}>Преподаватель</span>
            {was?.teacher && was.teacher !== "уточняется" ? (
              <>
                {fullTeacher}
                <span className={styles.instead}>вместо {was.teacher}</span>
              </>
            ) : (
              fullTeacher
            )}
          </p>
          <p className={styles.row}>
            <span className={styles.label}>Где</span>
            <span>
              {room}
              {building}
            </span>
          </p>
          <p className={styles.row}>
            <span className={styles.label}>Тема</span>
            {note?.topic ?? <span className={styles.empty}>Тема пока не указана</span>}
          </p>
          {note?.task && (
            <p className={styles.row}>
              <span className={styles.label}>Задание</span>
              {note.task}
            </p>
          )}
          {note && note.materials.length > 0 && (
            <div className={styles.row}>
              <span className={styles.label}>Материалы</span>
              <ul className={styles.materials}>
                {note.materials.map((m, i) => (
                  <li key={i}>
                    <span className={styles.kind}>{MATERIAL_KIND_LABEL[m.kind]}</span> {m.title}
                  </li>
                ))}
              </ul>
              <span className={styles.hint}>Файлы выдаёт преподаватель</span>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
