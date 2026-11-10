import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleCheck, PackageCheck } from "lucide-react";
import { studentHref } from "@/lib/hrefs";
import { getMyAppeal } from "@/server/appeals/service";
import type { AppealDetail } from "@/server/appeals/types";
import { requireStudent } from "@/server/auth/viewer";
import { mskTime, ruDate, ruRelativeDate, ruWhen } from "@/server/format";
import { markReadByHref } from "@/server/notifications";
import { Countdown } from "@/ui/appeals/Countdown";
import { FieldsSummary } from "@/ui/appeals/FieldsSummary";
import { personShortName } from "@/ui/appeals/labels";
import { Thread } from "@/ui/appeals/Thread";
import { Timeline } from "@/ui/appeals/Timeline";
import { Button } from "@/ui/Button";
import { RefreshOnce } from "@/ui/RefreshOnce";
import { Section } from "@/ui/Section";
import { StatusBadge } from "@/ui/StatusBadge";
import { SubmitButton } from "@/ui/SubmitButton";
import { confirmReceivedAction } from "../actions";
import { wizardHref } from "../wizard";
import { ReplyForm } from "./ReplyForm";
import styles from "./appeal.module.css";

export const metadata: Metadata = { title: "Обращение" };

const dueText = (d: Date, now: Date) => `${ruRelativeDate(d, now)}, ${mskTime(d)}`;

/** Обещанный срок: дата крупно и живой обратный отсчёт; просрочка — красным. */
function PromisePanel({ a, now }: { a: AppealDetail; now: Date }) {
  return (
    <section className={styles.promise} data-surface="paper" data-overdue={a.overdue || undefined} aria-label="Срок ответа">
      <p className={styles.promiseLabel}>Ответим до</p>
      <p className={styles.promiseDate}>{dueText(a.slaDueAt, now)}</p>
      <Countdown className={styles.countdown} due={a.slaDueAt.toISOString()} serverNow={now.toISOString()} />
      {a.overdue && <p className={styles.promiseNote}>Срок прошёл — сотрудник видит просрочку в своей очереди.</p>}
      <p className={styles.promiseWho}>
        {a.assignee ? <>Занимается {a.assignee}</> : "Обращение ждёт сотрудника — его возьмут в работу в порядке очереди."}
      </p>
    </section>
  );
}

/** Нужно уточнение: вопрос деканата и поле ответа — первым на экране. */
function NeedsInfoPanel({ a, now }: { a: AppealDetail; now: Date }) {
  const asked = [...a.events].reverse().find((e) => e.kind === "needs_info");
  return (
    <section className={styles.panel} data-tone="accent" data-surface="paper" aria-labelledby="needs-title">
      <h2 id="needs-title" className={styles.panelTitle}>Деканат ждёт твоего ответа</h2>
      <p className={styles.panelText}>Ответь, и мы продолжим работу: новый срок ответа начнётся с твоего сообщения.</p>
      {asked?.text && (
        <figure className={styles.question}>
          <figcaption className={styles.questionMeta}>
            {asked.actorName ? `${personShortName(asked.actorName, "staff")}, ` : ""}{ruWhen(asked.at, now)}
          </figcaption>
          <blockquote className={styles.questionBody}>{asked.text}</blockquote>
        </figure>
      )}
      <ReplyForm appealId={a.id} mode="answer" />
    </section>
  );
}

/** Готово: где и до какого числа забрать справку, «Получил». */
function ReadyPanel({ a }: { a: AppealDetail }) {
  const cert = a.type.kind === "certificate";
  return (
    <section className={styles.panel} data-tone="ok" data-surface="paper" aria-labelledby="ready-title">
      <h2 id="ready-title" className={styles.panelTitle}>{cert ? "Справка готова" : "Готово"}</h2>
      {a.pickup ? (
        <p className={styles.pickup}>
          Забрать: {a.pickup.place}, до {ruDate(a.pickup.until)}, {mskTime(a.pickup.until)}
        </p>
      ) : (
        <p className={styles.panelText}>Ответ деканата — в переписке ниже.</p>
      )}
      <p className={styles.panelText}>
        {cert ? "Когда заберёшь справку, нажми «Получил» — обращение закроется." : "Если всё понятно, нажми «Получил» — обращение закроется."}
      </p>
      <form action={confirmReceivedAction} className={styles.panelAction}>
        <input type="hidden" name="appealId" value={a.id} />
        <SubmitButton variant="primary" icon={<PackageCheck />}>Получил</SubmitButton>
      </form>
    </section>
  );
}

function RejectedPanel({ a }: { a: AppealDetail }) {
  return (
    <section className={styles.panel} data-tone="danger" data-surface="paper" aria-labelledby="rejected-title">
      <h2 id="rejected-title" className={styles.panelTitle}>Обращение отклонено</h2>
      {a.rejectReason && <p className={styles.reason}>Причина: {a.rejectReason}</p>}
      <div className={styles.panelAction}>
        <Button href={wizardHref({ type: a.type.code })} variant="secondary">Оформить заново</Button>
      </div>
    </section>
  );
}

/** Следующая остановка на треке. */
function nextStop(a: AppealDetail, now: Date): string | undefined {
  if (a.status === "submitted" || a.status === "in_progress") return `Ответ до ${dueText(a.slaDueAt, now)}`;
  if (a.status === "needs_info") return "Ждём твой ответ";
  if (a.status === "ready" && a.pickup) return `Забрать до ${ruDate(a.pickup.until)}`;
  return undefined;
}

export default async function AppealPage({ params, searchParams }: PageProps<"/dekanat/[id]">) {
  const v = await requireStudent();
  const now = new Date();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await getMyAppeal(v, id, now);
  if (!a) notFound();
  // открыл карточку — уведомления о ней (ответ сотрудника, «готово») больше не новые
  const marked = await markReadByHref(v, studentHref(a.id));

  const running = a.status === "submitted" || a.status === "in_progress";
  const writable = a.status !== "rejected" && a.status !== "closed";

  return (
    <>
      {marked > 0 && <RefreshOnce />}
      <Link href="/dekanat" className={styles.back}>
        <ChevronLeft aria-hidden="true" />
        Мои обращения
      </Link>

      {sp.created === "1" && (
        <div className={styles.banner} role="status">
          <CircleCheck aria-hidden="true" />
          <p>Обращение отправлено в «{a.department.name}». Ответим до {ruDate(a.slaDueAt)}.</p>
        </div>
      )}

      <header className={styles.header}>
        <p className={styles.kicker}>Обращение {a.number}</p>
        <h1 className={styles.title}>{a.type.title}</h1>
        <div className={styles.meta}>
          <StatusBadge status={a.status} />
          <span>{a.department.name}</span>
        </div>
      </header>

      {running && <PromisePanel a={a} now={now} />}
      {a.status === "needs_info" && <NeedsInfoPanel a={a} now={now} />}
      {a.status === "ready" && <ReadyPanel a={a} />}
      {a.status === "rejected" && <RejectedPanel a={a} />}

      <Section title="Путь обращения" id="timeline-title">
        <Timeline events={a.events} now={now} next={nextStop(a, now)} />
      </Section>

      <Section title="Что в обращении" id="fields-title">
        <FieldsSummary appeal={a} />
      </Section>

      <Section title="Переписка" id="thread-title">
        {a.messages.length > 0 ? (
          <Thread messages={a.messages} now={now} mine="student" />
        ) : (
          <p className={styles.quiet}>
            Сообщений пока нет. Если хочешь что-то добавить, напиши — сотрудник увидит это в обращении.
          </p>
        )}
        {writable && a.status !== "needs_info" && <ReplyForm appealId={a.id} mode="message" />}
        {!writable && (
          <p className={styles.closedNote}>
            Обращение закрыто — написать в него нельзя. Если вопрос остался, <Link href="/dekanat">задай его заново</Link>.
          </p>
        )}
      </Section>
    </>
  );
}
