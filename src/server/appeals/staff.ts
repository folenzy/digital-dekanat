import "server-only";
import { and, asc, count, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { StaffViewer } from "../auth/viewer";
import { db } from "../db/client";
import { appealMessages, appeals, appealTypes, departments, faculties, groups, staff, students } from "../db/schema";
import { LIMITS } from "../limits";
import { mskDdMm } from "../time";
import { addEvent, runAppealAction, staffScope, type LockedAppeal } from "./access";
import { listColumns, loadAppealDetail, staffDisplayName, studentFullName, toListItem } from "./detail";
import { excerpt } from "./notify";
import { fail, fieldError, fieldErrorsOf, isUuid, type Result } from "./result";
import { SLA_RUNNING_STATUSES } from "./sla";
import {
  messageTextSchema, pickupSchema, rejectReasonSchema, type AppealStatus, type DepartmentCode, type DepartmentInfo,
  type Pickup, type QueueAppealDetail, type QueueItem, type StaffSummary, type StaffTab,
} from "./types";

// Кабинет сотрудника: только обращения отделов из v.departmentIds. Действовать может любой сотрудник отдела.

export type AppealActionResult = Result<{ status: AppealStatus }>;

const TAB_STATUSES: Record<StaffTab, AppealStatus[]> = {
  new: ["submitted"],
  in_progress: ["in_progress"],
  waiting: ["needs_info"],
  closed: ["ready", "rejected", "closed"],
};
const WEEK_MS = 7 * 24 * 3_600_000;

/** Очередь вкладки, по сроку ответа (ближайший сверху); departmentId — фильтр внутри своих отделов. */
export async function listQueue(
  v: StaffViewer, tab: StaffTab, departmentId?: number, now: Date = new Date(),
): Promise<QueueItem[]> {
  if (!Object.hasOwn(TAB_STATUSES, tab)) return [];
  if (departmentId !== undefined && !Number.isInteger(departmentId)) return [];
  const rows = await db
    .select({
      ...listColumns,
      stLast: students.lastName, stFirst: students.firstName, stMiddle: students.middleName, group: groups.name,
      asLast: staff.lastName, asFirst: staff.firstName, asMiddle: staff.middleName,
    })
    .from(appeals)
    .innerJoin(appealTypes, eq(appealTypes.code, appeals.typeCode))
    .innerJoin(departments, eq(departments.id, appeals.departmentId))
    .innerJoin(students, eq(students.id, appeals.studentId))
    .innerJoin(groups, eq(groups.id, students.groupId))
    .leftJoin(staff, eq(staff.id, appeals.assigneeStaffId))
    .where(and(
      staffScope(v), inArray(appeals.status, TAB_STATUSES[tab]),
      departmentId !== undefined ? eq(appeals.departmentId, departmentId) : undefined,
    ))
    .orderBy(asc(appeals.slaDueAt), asc(appeals.createdAt));
  return rows.map((r) => ({
    ...toListItem(r, now),
    assignee: r.asLast !== null && r.asFirst !== null
      ? staffDisplayName({ lastName: r.asLast, firstName: r.asFirst, middleName: r.asMiddle }) : null,
    student: {
      fullName: studentFullName({ lastName: r.stLast, firstName: r.stFirst, middleName: r.stMiddle }), group: r.group,
    },
  }));
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
  const found = await loadAppealDetail(staffScope(v), id, now);
  if (!found) return null;
  const [st] = await db
    .select({
      lastName: students.lastName, firstName: students.firstName, middleName: students.middleName,
      faculty: faculties.name, group: groups.name, course: groups.course,
    })
    .from(students)
    .innerJoin(groups, eq(groups.id, students.groupId))
    .innerJoin(faculties, eq(faculties.id, groups.facultyId))
    .where(eq(students.id, found.studentId));
  return {
    ...found.detail,
    student: { fullName: studentFullName(st), faculty: st.faculty, group: st.group, course: st.course },
  };
}

/** Общее для всех действий сотрудника: кто первым взялся — исполнитель; время первого ответа ставится один раз. */
function touch(a: LockedAppeal, v: StaffViewer, now: Date) {
  return { assigneeStaffId: a.assigneeStaffId ?? v.staffId, firstResponseAt: a.firstResponseAt ?? now, updatedAt: now };
}

const onlyFrom = (...statuses: AppealStatus[]) => (a: LockedAppeal) =>
  statuses.includes(a.status) ? null : fail("bad_transition");

/** Взять в работу: submitted → in_progress, исполнитель — этот сотрудник. */
export async function takeAppeal(v: StaffViewer, id: string, now: Date = new Date()): Promise<AppealActionResult> {
  if (!isUuid(id)) return fail("not_found");
  return runAppealAction({
    scope: staffScope(v), id, now, actorUserId: v.userId, counterpart: "student",
    check: onlyFrom("submitted"),
    apply: async (tx, a) => {
      await tx.update(appeals).set({ ...touch(a, v, now), status: "in_progress", assigneeStaffId: v.staffId })
        .where(eq(appeals.id, a.id));
      await addEvent(tx, a.id, v.userId, "taken", "Принято в работу", now);
      return {
        status: "in_progress",
        notice: {
          kind: "appeal_status", title: `Обращение ${a.number} принято в работу`,
          body: `${a.typeTitle}: ответим до ${mskDdMm(a.slaDueAt)}.`,
        },
      };
    },
  });
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
