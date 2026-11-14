import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import type { StaffViewer } from "../auth/viewer";
import { db } from "../db/client";
import { isDbId } from "../db/ids";
import { appealMessages, appeals, appealTypes, departments, faculties, groups, staff, students } from "../db/schema";
import { LIMITS } from "../limits";
import { mskAt, mskDateKey, mskDdMm, shiftDateKey } from "../time";
import { addEvent, lockNext, runAppealAction, staffScope, type LockedAppeal, type Tx } from "./access";
import { listColumns, loadAppealDetail, staffDisplayName, studentFullName, toListItem } from "./detail";
import { excerpt } from "./notify";
import { fail, fieldError, fieldErrorsOf, isUuid, ok, type AppealActionResult, type Result } from "./result";
import { SLA_RUNNING_STATUSES } from "./sla";
import {
  messageTextSchema, pickupSchema, rejectReasonSchema, type AppealStatus, type DepartmentCode, type DepartmentInfo,
  type Pickup, type QueueAppealDetail, type QueueGroup, type QueueGroupKey, type QueueItem, type QueueTabCounts,
  type StaffSummary, type StaffTab,
} from "./types";

// Кабинет сотрудника: только обращения отделов из v.departmentIds. Действовать может любой сотрудник отдела.

const TAB_STATUSES: Record<StaffTab, AppealStatus[]> = {
  new: ["submitted"],
  in_progress: ["in_progress"],
  waiting: ["needs_info"],
  closed: ["ready", "rejected", "closed"],
};
const WEEK_MS = 7 * 24 * 3_600_000;

/** Строки очереди под условием where (видимость уже внутри), в заданном порядке, не больше limit. */
async function selectQueue(
  v: StaffViewer, where: SQL | undefined, order: SQL[], now: Date, limit?: number,
): Promise<QueueItem[]> {
  const query = db
    .select({
      ...listColumns,
      stLast: students.lastName, stFirst: students.firstName, stMiddle: students.middleName, group: groups.name,
      stStress: students.nameStress,
      asLast: staff.lastName, asFirst: staff.firstName, asMiddle: staff.middleName, asStress: staff.nameStress,
    })
    .from(appeals)
    .innerJoin(appealTypes, eq(appealTypes.code, appeals.typeCode))
    .innerJoin(departments, eq(departments.id, appeals.departmentId))
    .innerJoin(students, eq(students.id, appeals.studentId))
    .innerJoin(groups, eq(groups.id, students.groupId))
    .leftJoin(staff, eq(staff.id, appeals.assigneeStaffId))
    .where(where)
    .orderBy(...order);
  const rows = limit === undefined ? await query : await query.limit(limit);
  return rows.map((r) => ({
    ...toListItem(r, now),
    assignee: r.asLast !== null && r.asFirst !== null
      ? staffDisplayName({ lastName: r.asLast, firstName: r.asFirst, middleName: r.asMiddle, stress: r.asStress }, v.showStress)
      : null,
    student: {
      fullName: studentFullName(
        { lastName: r.stLast, firstName: r.stFirst, middleName: r.stMiddle, stress: r.stStress }, v.showStress,
      ),
      group: r.group,
    },
  }));
}

/** Условие вкладки: свои отделы, статусы вкладки, фильтр отдела. undefined — вкладка или отдел невалидны. */
function tabWhere(v: StaffViewer, tab: StaffTab, departmentId: number | undefined): SQL | undefined {
  if (!Object.hasOwn(TAB_STATUSES, tab)) return undefined;
  if (departmentId !== undefined && !isDbId(departmentId)) return undefined;
  return and(
    staffScope(v), inArray(appeals.status, TAB_STATUSES[tab]),
    departmentId !== undefined ? eq(appeals.departmentId, departmentId) : undefined,
  );
}

const BY_DUE = [asc(appeals.slaDueAt), asc(appeals.createdAt)];

/** Очередь вкладки целиком, по сроку ответа (ближайший сверху); departmentId — фильтр внутри своих отделов. */
export async function listQueue(
  v: StaffViewer, tab: StaffTab, departmentId?: number, now: Date = new Date(),
): Promise<QueueItem[]> {
  const where = tabWhere(v, tab, departmentId);
  return where ? selectQueue(v, where, BY_DUE, now) : [];
}

/** Строк в группе без разворота. «Сегодня» не ограничивается: что горит сегодня, видно целиком. */
export const QUEUE_GROUP_LIMIT = 10;
/** «Ждут студента», «Закрытые» — одна группа, строк без разворота. */
const QUEUE_LIST_LIMIT = 30;
/** Потолок развёрнутой группы и «Сегодня»: страница не должна расти без границы. */
const QUEUE_EXPANDED_MAX = 500;

/**
 * Очередь вкладки группами. Пока срок идёт («Новые», «В работе») — по сроку ответа: просрочено, сегодня,
 * завтра, позже (границы — полночь по Москве). Каждая группа — диапазон срока, поэтому выбирается своим
 * запросом с пределом строк по индексу (отдел, статус, срок); total — из одного запроса-счётчика.
 * «Ждут студента» (по сроку) и «Закрытые» (свежие сверху) — одна группа all. Пустые группы не возвращаются.
 * expand — какую группу показать целиком (значение из адреса; незнакомое игнорируется).
 */
export async function listQueueGroups(
  v: StaffViewer, tab: StaffTab, departmentId?: number, now: Date = new Date(), expand?: QueueGroupKey,
): Promise<QueueGroup[]> {
  const where = tabWhere(v, tab, departmentId);
  if (!where) return [];
  const cap = (key: QueueGroupKey, base: number) => (key === expand ? QUEUE_EXPANDED_MAX : base);

  if (tab === "waiting" || tab === "closed") {
    const [{ total }] = await db.select({ total: count() }).from(appeals).where(where);
    if (total === 0) return [];
    const order = tab === "closed" ? [desc(appeals.updatedAt), desc(appeals.createdAt)] : BY_DUE;
    return [{ key: "all", total, items: await selectQueue(v, where, order, now, cap("all", QUEUE_LIST_LIMIT)) }];
  }

  const today = mskDateKey(now);
  const todayEnd = mskAt(shiftDateKey(today, 1), "00:00");
  const tomorrowEnd = mskAt(shiftDateKey(today, 2), "00:00");
  const ranges: { key: QueueGroupKey; when: SQL; limit: number }[] = [
    { key: "overdue", when: lt(appeals.slaDueAt, now), limit: cap("overdue", QUEUE_GROUP_LIMIT) },
    { key: "today", when: and(gte(appeals.slaDueAt, now), lt(appeals.slaDueAt, todayEnd))!, limit: QUEUE_EXPANDED_MAX },
    {
      key: "tomorrow", when: and(gte(appeals.slaDueAt, todayEnd), lt(appeals.slaDueAt, tomorrowEnd))!,
      limit: cap("tomorrow", QUEUE_GROUP_LIMIT),
    },
    { key: "later", when: gte(appeals.slaDueAt, tomorrowEnd), limit: cap("later", QUEUE_GROUP_LIMIT) },
  ];
  const [totals] = await db
    .select(Object.fromEntries(ranges.map((r) => [r.key, count(sql`case when ${r.when} then 1 end`)])))
    .from(appeals)
    .where(where);
  const filled = ranges.filter((r) => Number(totals[r.key]) > 0);
  return Promise.all(filled.map(async (r) => ({
    key: r.key,
    total: Number(totals[r.key]),
    items: await selectQueue(v, and(where, r.when), BY_DUE, now, r.limit),
  })));
}

/** Сколько обращений на каждой вкладке (свои отделы, фильтр отдела) — одним запросом, без загрузки строк. */
export async function countQueueTabs(v: StaffViewer, departmentId?: number): Promise<QueueTabCounts> {
  const counts: QueueTabCounts = { new: 0, in_progress: 0, waiting: 0, closed: 0 };
  if (departmentId !== undefined && !isDbId(departmentId)) return counts;
  const rows = await db
    .select({ status: appeals.status, n: count() })
    .from(appeals)
    .where(and(staffScope(v), departmentId !== undefined ? eq(appeals.departmentId, departmentId) : undefined))
    .groupBy(appeals.status);
  for (const r of rows) {
    const tab = (Object.keys(TAB_STATUSES) as StaffTab[]).find((t) => TAB_STATUSES[t].includes(r.status));
    if (tab) counts[tab] += r.n;
  }
  return counts;
}

/** Отделы сотрудника — для фильтра очереди. */
export async function listStaffDepartments(v: StaffViewer): Promise<DepartmentInfo[]> {
  if (v?.role !== "staff" || !Array.isArray(v.departmentIds) || v.departmentIds.length === 0) return [];
  const rows = await db.select({ id: departments.id, code: departments.code, name: departments.name })
    .from(departments).where(inArray(departments.id, v.departmentIds)).orderBy(asc(departments.id));
  return rows.map((d) => ({ ...d, code: d.code as DepartmentCode }));
}

/** Карточка для сотрудника: как у студента плюс ФИО, факультет, группа, курс — и ничего больше о студенте. */
export async function getQueueAppeal(
  v: StaffViewer, id: string, now: Date = new Date(),
): Promise<QueueAppealDetail | null> {
  if (!isUuid(id)) return null;
  const found = await loadAppealDetail(staffScope(v), id, now, v.showStress);
  if (!found) return null;
  const [st] = await db
    .select({
      lastName: students.lastName, firstName: students.firstName, middleName: students.middleName,
      stress: students.nameStress, faculty: faculties.name, group: groups.name, course: groups.course,
    })
    .from(students)
    .innerJoin(groups, eq(groups.id, students.groupId))
    .innerJoin(faculties, eq(faculties.id, groups.facultyId))
    .where(eq(students.id, found.studentId));
  return {
    ...found.detail,
    student: { fullName: studentFullName(st, v.showStress), faculty: st.faculty, group: st.group, course: st.course },
  };
}

/** Общее для всех действий сотрудника: кто первым взялся — исполнитель; время первого ответа ставится один раз. */
function touch(a: LockedAppeal, v: StaffViewer, now: Date) {
  return { assigneeStaffId: a.assigneeStaffId ?? v.staffId, firstResponseAt: a.firstResponseAt ?? now, updatedAt: now };
}

const onlyFrom = (...statuses: AppealStatus[]) => (a: LockedAppeal) =>
  statuses.includes(a.status) ? null : fail("bad_transition");

/** Запись «взял в работу»: статус, исполнитель, событие и уведомление студенту. */
function applyTake(v: StaffViewer, now: Date) {
  return async (tx: Tx, a: LockedAppeal) => {
    await tx.update(appeals).set({ ...touch(a, v, now), status: "in_progress", assigneeStaffId: v.staffId })
      .where(eq(appeals.id, a.id));
    await addEvent(tx, a.id, v.userId, "taken", "Принято в работу", now);
    return {
      status: "in_progress" as const,
      notice: {
        kind: "appeal_status" as const, title: `Обращение ${a.number} принято в работу`,
        body: `${a.typeTitle}: ответим до ${mskDdMm(a.slaDueAt)}.`,
      },
    };
  };
}

/** Взять в работу: submitted → in_progress, исполнитель — этот сотрудник. */
export async function takeAppeal(v: StaffViewer, id: string, now: Date = new Date()): Promise<AppealActionResult> {
  if (!isUuid(id)) return fail("not_found");
  return runAppealAction({
    scope: staffScope(v), id, now, actorUserId: v.userId, counterpart: "student",
    check: onlyFrom("submitted"),
    apply: applyTake(v, now),
  });
}

/**
 * «Взять следующее»: самое срочное новое обращение в своих отделах (или в отделе departmentId) — в работу.
 * Выбор и запись в одной транзакции, занятые другим сотрудником строки пропускаются (SKIP LOCKED).
 * Нечего брать → empty. id в ответе — чтобы открыть взятое обращение.
 */
export async function takeNextAppeal(
  v: StaffViewer, departmentId?: number, now: Date = new Date(),
): Promise<Result<{ status: AppealStatus; id: string }>> {
  if (departmentId !== undefined && !isDbId(departmentId)) return fail("empty");
  const scope = staffScope(v);
  const where = and(
    scope, eq(appeals.status, "submitted"),
    departmentId !== undefined ? eq(appeals.departmentId, departmentId) : undefined,
  )!;
  const res = await runAppealAction({
    scope, pick: (tx) => lockNext(tx, where), now, actorUserId: v.userId, counterpart: "student",
    check: onlyFrom("submitted"),
    apply: applyTake(v, now),
  });
  if (!res.ok) return res;
  return ok({ status: res.value.status, id: res.value.id! });
}

/** Ответ в переписке (1–2000, лимит сотрудника 120 в час). На submitted сначала берёт в работу. В rejected / closed → `closed`. */
export async function replyAppeal(
  v: StaffViewer, id: string, text: string, now: Date = new Date(),
): Promise<AppealActionResult> {
  if (!isUuid(id)) return fail("not_found");
  const body = messageTextSchema.safeParse(text);
  if (!body.success) return fail("validation", fieldError("text", body.error));
  return runAppealAction({
    scope: staffScope(v), id, now, actorUserId: v.userId, counterpart: "student", limit: LIMITS.staffMessage,
    check: (a) => (a.status === "rejected" || a.status === "closed" ? fail("closed") : null),
    apply: async (tx, a) => {
      const taking = a.status === "submitted";
      const status: AppealStatus = taking ? "in_progress" : a.status;
      await tx.update(appeals).set({ ...touch(a, v, now), status }).where(eq(appeals.id, a.id));
      if (taking) await addEvent(tx, a.id, v.userId, "taken", "Принято в работу", now);
      await tx.insert(appealMessages).values({ appealId: a.id, authorUserId: v.userId, body: body.data, createdAt: now });
      await addEvent(tx, a.id, v.userId, "replied", null, now);
      return {
        status,
        notice: { kind: "appeal_message", title: `Деканат ответил по обращению ${a.number}`, body: excerpt(body.data) },
      };
    },
  });
}

/** Запросить уточнение: in_progress → needs_info, вопрос уходит в переписку и в таймлайн. Лимит — как у сообщений. */
export async function requestInfo(
  v: StaffViewer, id: string, question: string, now: Date = new Date(),
): Promise<AppealActionResult> {
  if (!isUuid(id)) return fail("not_found");
  const q = messageTextSchema.safeParse(question);
  if (!q.success) return fail("validation", fieldError("question", q.error));
  return runAppealAction({
    scope: staffScope(v), id, now, actorUserId: v.userId, counterpart: "student", limit: LIMITS.staffMessage,
    check: onlyFrom("in_progress"),
    apply: async (tx, a) => {
      await tx.update(appeals).set({ ...touch(a, v, now), status: "needs_info" }).where(eq(appeals.id, a.id));
      await tx.insert(appealMessages).values({ appealId: a.id, authorUserId: v.userId, body: q.data, createdAt: now });
      await addEvent(tx, a.id, v.userId, "needs_info", q.data, now);
      return {
        status: "needs_info",
        notice: { kind: "appeal_message", title: `Нужно уточнение по обращению ${a.number}`, body: excerpt(q.data) },
      };
    },
  });
}

/**
 * Готово: in_progress → ready. Для справки обязательно, где и до какого момента забрать (в будущем);
 * для остальных видов pickup = null.
 */
export async function markReady(
  v: StaffViewer, id: string, pickup: Pickup | null, now: Date = new Date(),
): Promise<AppealActionResult> {
  if (!isUuid(id)) return fail("not_found");
  let pick: Pickup | null = null;
  if (pickup !== null && pickup !== undefined) {
    const parsed = pickupSchema.safeParse(pickup);
    if (!parsed.success) return fail("validation", fieldErrorsOf(parsed.error));
    if (parsed.data.until.getTime() <= now.getTime()) {
      return fail("validation", { until: "Срок выдачи должен быть позже текущего момента" });
    }
    pick = parsed.data;
  }
  return runAppealAction({
    scope: staffScope(v), id, now, actorUserId: v.userId, counterpart: "student",
    check: (a) => {
      if (a.status !== "in_progress") return fail("bad_transition");
      if (a.kind === "certificate" && !pick) return fail("validation", { place: "Укажи, где забрать справку" });
      if (a.kind !== "certificate" && pick) return fail("validation", { place: "Место выдачи указывается только для справок" });
      return null;
    },
    apply: async (tx, a) => {
      await tx.update(appeals)
        .set({ ...touch(a, v, now), status: "ready", pickupPlace: pick?.place ?? null, pickupUntil: pick?.until ?? null })
        .where(eq(appeals.id, a.id));
      if (pick) {
        const until = mskDdMm(pick.until);
        await addEvent(tx, a.id, v.userId, "ready", `Справка готова. Забрать: ${pick.place} до ${until}`, now);
        return {
          status: "ready",
          notice: {
            kind: "appeal_status", title: `Справка по обращению ${a.number} готова`,
            body: `Забери справку: ${pick.place}, до ${until}.`,
          },
        };
      }
      await addEvent(tx, a.id, v.userId, "ready", "Готово", now);
      return {
        status: "ready",
        notice: {
          kind: "appeal_status", title: `Обращение ${a.number} готово`,
          body: `${a.typeTitle}: готово. Подробности в карточке обращения.`,
        },
      };
    },
  });
}

/** Отклонить с причиной (5–500): submitted | in_progress → rejected. */
export async function rejectAppeal(
  v: StaffViewer, id: string, reason: string, now: Date = new Date(),
): Promise<AppealActionResult> {
  if (!isUuid(id)) return fail("not_found");
  const r = rejectReasonSchema.safeParse(reason);
  if (!r.success) return fail("validation", fieldError("reason", r.error));
  return runAppealAction({
    scope: staffScope(v), id, now, actorUserId: v.userId, counterpart: "student",
    check: onlyFrom("submitted", "in_progress"),
    apply: async (tx, a) => {
      await tx.update(appeals)
        .set({ ...touch(a, v, now), status: "rejected", rejectReason: r.data, closedAt: now })
        .where(eq(appeals.id, a.id));
      await addEvent(tx, a.id, v.userId, "rejected", r.data, now);
      return {
        status: "rejected",
        notice: { kind: "appeal_status", title: `Обращение ${a.number} отклонено`, body: `Причина: ${excerpt(r.data)}` },
      };
    },
  });
}

/** Сводка по своим отделам: новых, в работе, просрочено, среднее время первого ответа за 7 дней (ч, до 0,1). */
export async function getStaffSummary(v: StaffViewer, now: Date): Promise<StaffSummary> {
  const scope = staffScope(v);
  const [counts] = await db
    .select({
      new: count(sql`case when ${appeals.status} = 'submitted' then 1 end`),
      inProgress: count(sql`case when ${appeals.status} = 'in_progress' then 1 end`),
      overdue: count(sql`case when ${and(inArray(appeals.status, [...SLA_RUNNING_STATUSES]), lt(appeals.slaDueAt, now))} then 1 end`),
    })
    .from(appeals)
    .where(scope);
  const [avg] = await db
    .select({ hours: sql<string | null>`avg(extract(epoch from (${appeals.firstResponseAt} - ${appeals.createdAt})) / 3600)` })
    .from(appeals)
    .where(and(scope, gte(appeals.firstResponseAt, new Date(now.getTime() - WEEK_MS)), lte(appeals.firstResponseAt, now)));
  return {
    new: counts.new,
    inProgress: counts.inProgress,
    overdue: counts.overdue,
    avgFirstResponseHoursWeek: avg.hours === null ? null : Math.round(Number(avg.hours) * 10) / 10,
  };
}
