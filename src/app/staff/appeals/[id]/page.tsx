import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleCheck, CircleX, MessageCircleQuestionMark, Send } from "lucide-react";
import { staffHref } from "@/lib/hrefs";
import { getQueueAppeal } from "@/server/appeals/staff";
import { APPEAL_TEXT_LIMITS, type QueueAppealDetail } from "@/server/appeals/types";
import { requireStaff } from "@/server/auth/viewer";
import { mskTime, ruDate, ruRelativeDate, ruWhen } from "@/server/format";
import { markReadByHref } from "@/server/notifications";
import { mskDateKey, shiftDateKey } from "@/server/time";
import { Countdown } from "@/ui/appeals/Countdown";
import { FieldsSummary } from "@/ui/appeals/FieldsSummary";
import fieldStyles from "@/ui/appeals/FieldsSummary.module.css";
import { personShortName } from "@/ui/appeals/labels";
import { Thread } from "@/ui/appeals/Thread";
import { Timeline } from "@/ui/appeals/Timeline";
import { Section } from "@/ui/Section";
import { PICKUP_MAX_DAYS, PICKUP_PLACE_DEFAULT, pickupDefaultKey, tabOfStatus } from "@/ui/staff/labels";
import { StatusBadge } from "@/ui/StatusBadge";
import { replyAction, requestInfoAction } from "../../actions";
import { queueHref } from "../../params";
import { ReadyForm } from "./ReadyForm";
import { RefreshOnce } from "@/ui/RefreshOnce";
import { RejectForm } from "./RejectForm";
import { TakeForm } from "./TakeForm";
import { TextActionForm } from "./TextActionForm";
import styles from "./appeal.module.css";

export const metadata: Metadata = { title: "Обращение" };

type Appeal = QueueAppealDetail;

const dueText = (d: Date, now: Date) => `${ruRelativeDate(d, now)}, ${mskTime(d)}`;

/** Срок идёт: до какого момента ответить, живой отсчёт, кто ведёт; новое — «Взять в работу». */
function DeadlinePanel({ a, now }: { a: Appeal; now: Date }) {
  return (
    <section className={styles.deadline} data-surface="paper" data-overdue={a.overdue || undefined} aria-labelledby="deadline-title">
      <h2 id="deadline-title" className={styles.deadlineLabel}>Ответить до</h2>
      <p className={styles.deadlineDate}>{dueText(a.slaDueAt, now)}</p>
      <Countdown className={styles.countdown} due={a.slaDueAt.toISOString()} serverNow={now.toISOString()} />
      {a.overdue && <p className={styles.deadlineNote}>Срок прошёл — студент тоже видит просрочку.</p>}
      <div className={styles.deadlineWho}>
        {a.status === "submitted" ? (
          <>
            <p>Обращение ещё никто не взял. Возьми его — студент увидит, кто им занимается.</p>
            <TakeForm appealId={a.id} />
          </>
        ) : (
          <p>Ведёт {a.assignee ?? "сотрудник отдела"}</p>
        )}
      </div>
    </section>
  );
}

/** Нужно уточнение: что спросили и что срок на паузе. */
function WaitingPanel({ a, now }: { a: Appeal; now: Date }) {
  const asked = [...a.events].reverse().find((e) => e.kind === "needs_info");
  return (
    <section className={styles.panel} data-tone="warn" data-surface="paper" aria-labelledby="waiting-title">
      <h2 id="waiting-title" className={styles.panelTitle}>Ждём ответа студента</h2>
      <p className={styles.panelText}>Срок ответа на паузе: новый срок начнётся, когда студент ответит.</p>
      {asked?.text && (
        <figure className={styles.question}>
          <figcaption className={styles.questionMeta}>
            {asked.actorName ? `${personShortName(asked.actorName, "staff")}, ` : ""}{ruWhen(asked.at, now)}
          </figcaption>
          <blockquote className={styles.questionBody}>{asked.text}</blockquote>
        </figure>
      )}
    </section>
  );
}

function ReadyPanel({ a }: { a: Appeal }) {
  const cert = a.type.kind === "certificate";
  return (
    <section className={styles.panel} data-tone="ok" data-surface="paper" aria-labelledby="ready-title">
      <h2 id="ready-title" className={styles.panelTitle}>{cert ? "Справка готова" : "Готово"}</h2>
      {a.pickup && (
        <p className={styles.pickup}>
          Забрать: {a.pickup.place}, до {ruDate(a.pickup.until)}, {mskTime(a.pickup.until)}
        </p>
      )}
      <p className={styles.panelText}>Обращение закроется, когда студент нажмёт «Получил».</p>
    </section>
  );
}

function RejectedPanel({ a }: { a: Appeal }) {
  return (
    <section className={styles.panel} data-tone="danger" data-surface="paper" aria-labelledby="rejected-title">
      <h2 id="rejected-title" className={styles.panelTitle}>Обращение отклонено</h2>
      {a.rejectReason && <p className={styles.reason}>Причина: {a.rejectReason}</p>}
    </section>
  );
}

/** Решение по обращению: варианты раскрываются по одному (details с общим name — без JS). */
function Decision({ a, now }: { a: Appeal; now: Date }) {
  const working = a.status === "in_progress";
  const cert = a.type.kind === "certificate";
  const today = mskDateKey(now);
  return (
    <Section title="Решение" id="decision-title">
      <div className={styles.decisions} data-surface="paper">
        {working && (
          <details name="decision" className={styles.decision}>
            <summary className={styles.summary}>
              <MessageCircleQuestionMark aria-hidden="true" className={styles.summaryIcon} />
              <span className={styles.summaryText}>
                <span className={styles.summaryTitle}>Запросить уточнение</span>
                <span className={styles.summaryHint}>Если данных не хватает. Срок встанет на паузу до ответа студента</span>
              </span>
            </summary>
            <div className={styles.decisionBody}>
              <TextActionForm
                appealId={a.id}
                action={requestInfoAction}
                name="question"
                id="request-question"
                label="Вопрос студенту"
                submit="Отправить вопрос"
                icon={<Send />}
                max={APPEAL_TEXT_LIMITS.message}
                sentText="Вопрос отправлен"
              />
            </div>
          </details>
        )}
        {working && (
          <details name="decision" className={styles.decision}>
            <summary className={styles.summary}>
              <CircleCheck aria-hidden="true" className={styles.summaryIcon} />
              <span className={styles.summaryText}>
                <span className={styles.summaryTitle}>Готово</span>
                <span className={styles.summaryHint}>
                  {cert ? "Справка готова: укажи, где и до какого дня забрать" : "Вопрос решён, студент увидит новый статус"}
                </span>
              </span>
            </summary>
            <div className={styles.decisionBody}>
              <ReadyForm
                appealId={a.id}
                certificate={cert}
                defaultPlace={PICKUP_PLACE_DEFAULT}
                defaultUntil={pickupDefaultKey(now)}
                minUntil={today}
                maxUntil={shiftDateKey(today, PICKUP_MAX_DAYS)}
              />
            </div>
          </details>
        )}
        <details name="decision" className={styles.decision} data-tone="danger">
          <summary className={styles.summary}>
            <CircleX aria-hidden="true" className={styles.summaryIcon} />
            <span className={styles.summaryText}>
              <span className={styles.summaryTitle}>Отклонить</span>
              <span className={styles.summaryHint}>С причиной: студент увидит её в обращении</span>
            </span>
          </summary>
          <div className={styles.decisionBody}>
            <RejectForm appealId={a.id} number={a.number} />
          </div>
        </details>
      </div>
      {!working && (
        <p className={styles.quiet}>
          «Готово» и «Запросить уточнение» появятся, когда возьмёшь обращение в работу.
        </p>
      )}
    </Section>
  );
}

/** Следующая остановка на треке — глазами сотрудника. */
function nextStop(a: Appeal, now: Date): string | undefined {
  if (a.status === "submitted" || a.status === "in_progress") return `Ответ до ${dueText(a.slaDueAt, now)}`;
  if (a.status === "needs_info") return "Ждём ответ студента";
  if (a.status === "ready" && a.pickup) return `Студент забирает до ${ruDate(a.pickup.until)}`;
  return undefined;
}

export default async function StaffAppealPage({ params }: PageProps<"/staff/appeals/[id]">) {
  const v = await requireStaff();
  const now = new Date();
  const { id } = await params;
  const a = await getQueueAppeal(v, id, now);
  if (!a) notFound();
  // открыл карточку — уведомления о ней (новое обращение, сообщение студента) больше не новые
  const marked = await markReadByHref(v, staffHref(a.id));

  const running = a.status === "submitted" || a.status === "in_progress";
  const writable = a.status !== "rejected" && a.status !== "closed";

  return (
    <>
      {marked > 0 && <RefreshOnce />}
      <Link href={queueHref({ tab: tabOfStatus(a.status) })} className={styles.back}>
        <ChevronLeft aria-hidden="true" />
        Очередь
      </Link>

      <header className={styles.header}>
        <p className={styles.kicker}>Обращение {a.number}</p>
        <h1 className={styles.title}>{a.type.title}</h1>
        <div className={styles.meta}>
          <StatusBadge status={a.status} />
          <span>{a.department.name}</span>
        </div>
      </header>

      {running && <DeadlinePanel a={a} now={now} />}
      {a.status === "needs_info" && <WaitingPanel a={a} now={now} />}
      {a.status === "ready" && <ReadyPanel a={a} />}
      {a.status === "rejected" && <RejectedPanel a={a} />}

      <Section title="Студент" id="student-title">
        <dl className={fieldStyles.list} data-surface="paper">
          <div className={fieldStyles.row}>
            <dt className={fieldStyles.label}>ФИО</dt>
            <dd className={fieldStyles.value}>{a.student.fullName}</dd>
          </div>
          <div className={fieldStyles.row}>
            <dt className={fieldStyles.label}>Факультет</dt>
            <dd className={fieldStyles.value}>{a.student.faculty}</dd>
          </div>
          <div className={fieldStyles.row}>
            <dt className={fieldStyles.label}>Группа</dt>
            <dd className={fieldStyles.value}>{a.student.group}</dd>
          </div>
          <div className={fieldStyles.row}>
            <dt className={fieldStyles.label}>Курс</dt>
            <dd className={fieldStyles.value}>{a.student.course}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Что в обращении" id="fields-title">
        <FieldsSummary appeal={a} who="staff" />
      </Section>

      <Section title="Переписка" id="thread-title">
        {a.messages.length > 0 ? (
          <Thread messages={a.messages} now={now} mine="staff" />
        ) : (
          <p className={styles.quiet}>Сообщений пока нет.</p>
        )}
        {writable ? (
          <div className={styles.reply} data-surface="paper">
            <TextActionForm
              appealId={a.id}
              action={replyAction}
              name="text"
              id="staff-reply"
              label="Ответ студенту"
              hint={a.status === "submitted" ? "Ответ сразу возьмёт обращение в работу." : undefined}
              submit="Ответить"
              icon={<Send />}
              max={APPEAL_TEXT_LIMITS.message}
              sentText="Ответ отправлен"
            />
          </div>
        ) : (
          <p className={styles.closedNote}>Обращение закрыто — написать в него нельзя.</p>
        )}
      </Section>

      {running && <Decision a={a} now={now} />}

      <Section title="Путь обращения" id="timeline-title">
        <Timeline events={a.events} now={now} next={nextStop(a, now)} />
      </Section>
    </>
  );
}
