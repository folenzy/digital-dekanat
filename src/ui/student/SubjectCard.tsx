import { CircleAlert, CircleCheck, Circle } from "lucide-react";
import { dayDiff, plural, ruDateKey } from "@/server/format";
import { gradeGoal, gradeMarks, nearestCheckpoint, type EnrollmentView, type GradeGoal } from "@/server/grades";
import { Badge } from "@/ui/Badge";
import { CONTROL_FORM_LABEL, gradeLabel } from "./labels";
import styles from "./SubjectCard.module.css";

const POINTS: readonly [string, string, string] = ["балл", "балла", "баллов"];
const DAYS: readonly [string, string, string] = ["день", "дня", "дней"];

/** Допуск в строке предмета: «есть» — обычным текстом, метка — только когда допуска нет или он не решён. */
function Admission({ admitted }: { admitted: boolean | null }) {
  if (admitted === true) return <span>допуск есть</span>;
  if (admitted === false) return <Badge tone="danger">Нет допуска</Badge>;
  return <Badge tone="warn">Допуск не решён</Badge>;
}

/** «До «4» нужно ещё 9» / «До зачёта нужно ещё 15»; пройдено всё — «На «5» уже набрано» / «На зачёт уже набрано». */
function goalText(goal: GradeGoal, credit: boolean): string {
  if (goal.kind === "need") {
    return credit ? `До зачёта нужно ещё ${goal.need}` : `До «${goal.label}» нужно ещё ${goal.need}`;
  }
  return credit ? "На зачёт уже набрано" : `На «${goal.label}» уже набрано`;
}

/** Слово оценки без цифры: «4, хорошо» → «хорошо»; «зачёт» — как есть. */
function gradeWord(grade: string): string {
  const label = gradeLabel(grade);
  return label.includes(", ") ? label.split(", ")[1] : label;
}

export function SubjectCard({ e, today, riskIds }: { e: EnrollmentView; today: string; riskIds: Set<number> }) {
  const done = e.checkpoints.filter((c) => c.score !== null).length;
  const remaining = e.checkpoints.filter((c) => c.score === null).reduce((sum, c) => sum + c.maxPoints, 0);
  const points = Math.min(100, Math.max(0, e.points ?? 0));
  const ahead = Math.min(100 - points, remaining);
  const credit = e.controlForm === "credit";
  const rest = e.controlForm === "exam" ? "на экзамене" : "на зачёте";
  const marks = gradeMarks(e.controlForm);
  const goal = gradeGoal(e.points, e.controlForm);
  const goalLine = goalText(goal, credit);
  const next = nearestCheckpoint(e.checkpoints, today);

  return (
    <li className={styles.subject}>
      <div className={styles.subjectHead}>
        <h3 className={styles.subjectTitle}>{e.discipline}</h3>
        <p className={styles.pointsLine}>
          <span className={`${styles.pointsNum} num`}>{points}</span>
          <span className={styles.pointsMax}> из 100</span>
        </p>
      </div>

      <div className={styles.subjectMeta}>
        <p className={styles.form}>
          {CONTROL_FORM_LABEL[e.controlForm]}, <Admission admitted={e.admitted} />
        </p>
        {!e.finalGrade && (
          <p className={styles.prelim}>
            {e.pace ? (
              <>предварительно <strong>{e.pace.grade}</strong>, {e.pace.score} из {e.pace.max}</>
            ) : done > 0 ? (
              "пока мало оценок"
            ) : (
              "точки ещё впереди"
            )}
          </p>
        )}
      </div>

      <div className={styles.scale}>
        <div
          className={styles.bar}
          role="meter"
          aria-label={`Баллы по дисциплине «${e.discipline}»`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={points}
          aria-valuetext={`${points} из 100${e.finalGrade ? "" : `, ${goalLine.charAt(0).toLowerCase()}${goalLine.slice(1)}`}${remaining ? `, в контрольных точках можно набрать ещё ${remaining}, остальное — ${rest}` : `, остальные баллы — ${rest}`}`}
        >
          <span className={styles.barFill} style={{ width: `${points}%` }} />
          {ahead > 0 && <span className={styles.barAhead} style={{ left: `${points}%`, width: `${ahead}%` }} />}
          {marks.map((m) => <span key={m.label} className={styles.tick} data-tick={m.at} style={{ left: `${m.at}%` }} />)}
        </div>
        {/* Подписи порогов: для скринридера всё уже сказано в aria-valuetext */}
        {marks.map((m) => (
          <span key={m.label} className={styles.mark} data-at={m.at} style={{ left: `${m.at}%` }} aria-hidden="true">{m.label}</span>
        ))}
      </div>

      <ul className={styles.facts}>
        {e.finalGrade ? (
          <li>Итог: <strong>{gradeWord(e.finalGrade)}</strong></li>
        ) : (
          <>
            <li>{goalLine}</li>
            {next ? (
              <li>
                Ближайшая точка: «{next.title}»,{" "}
                {next.overdue ? <span className={styles.overdue}>просрочена с {ruDateKey(next.dueDate)}</span> : `до ${ruDateKey(next.dueDate)}`}, до +{next.maxPoints}
              </li>
            ) : (
              <li>Остальное — {rest}</li>
            )}
          </>
        )}
      </ul>

      {e.checkpoints.length > 0 && (
        <details className={styles.checkpoints} open={e.checkpoints.some((c) => riskIds.has(c.id)) || undefined}>
          <summary className={styles.summary}>
            Контрольные точки: сдано {done} из {e.checkpoints.length}
          </summary>
          <ul className={styles.cpList}>
            {e.checkpoints.map((c) => {
              const overdue = c.score === null && c.dueDate < today;
              const state = c.score !== null ? "done" : overdue && c.required ? "overdue" : "open";
              const left = dayDiff(today, c.dueDate);
              return (
                <li key={c.id} className={styles.cp} data-state={state}>
                  <span className={styles.cpIcon} aria-hidden="true">
                    {state === "done" ? <CircleCheck /> : state === "overdue" ? <CircleAlert /> : <Circle />}
                  </span>
                  <span className={styles.cpBody}>
                    <span className={styles.cpTitle}>
                      {c.title}
                      {c.required && <span className={styles.required}>обязательная</span>}
                    </span>
                    <span className={styles.cpMeta}>
                      {c.score !== null
                        ? `${c.score} из ${c.maxPoints} ${plural(c.maxPoints, POINTS)}`
                        : overdue
                          ? `не сдана, срок прошёл ${ruDateKey(c.dueDate)}`
                          : `до ${ruDateKey(c.dueDate)}${left <= 7 ? ` (через ${left} ${plural(left, DAYS)})` : ""}, до ${c.maxPoints} ${plural(c.maxPoints, POINTS)}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </li>
  );
}
