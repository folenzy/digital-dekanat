import "server-only";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { personName } from "@/lib/stress";
import { db } from "../db/client";
import {
  appealEvents, appealMessages, appeals, appealTypes, departments, disciplines, staff, students,
} from "../db/schema";
import { isAppealOverdue } from "./sla";
import type {
  AppealDetail, AppealEventKind, AppealEventView, AppealKind, AppealListItem, AppealMessageView, AppealStatus,
  AppealTopic, AppealTypeCode, DepartmentCode,
} from "./types";

// Чтение обращений для экранов: строка списка и карточка (общая часть для студента и сотрудника).

/** Человек и ударения, которые он сам расставил в своём ФИО (см. src/lib/stress.ts). */
type Person = { lastName: string; firstName: string; middleName: string | null; stress?: unknown };

/** Студент — официально: «Миронова Алина Сергеевна». show — показывать ли ударения тому, кто смотрит. */
export function studentFullName(p: Person, show = false): string {
  return personName(p, { order: "official", stress: p.stress, show });
}

/** Сотрудник — как представляется студенту: «Ирина Николаевна Белова». */
export function staffDisplayName(p: Person, show = false): string {
  return personName(p, { order: "display", stress: p.stress, show });
}

/** Колонки строки списка; запрос строится от appeals с join appeal_types и departments. */
export const listColumns = {
  id: appeals.id, number: appeals.number, typeCode: appeals.typeCode, typeTitle: appealTypes.title,
  topic: appealTypes.topic, kind: appealTypes.kind,
  departmentId: departments.id, departmentCode: departments.code, departmentName: departments.name,
  status: appeals.status, slaDueAt: appeals.slaDueAt, createdAt: appeals.createdAt, updatedAt: appeals.updatedAt,
};

type ListRow = {
  id: string; number: string; typeCode: string; typeTitle: string; topic: string; kind: AppealKind;
  departmentId: number; departmentCode: string; departmentName: string;
  status: AppealStatus; slaDueAt: Date; createdAt: Date; updatedAt: Date;
};

export function toListItem(r: ListRow, now: Date): AppealListItem {
  return {
    id: r.id, number: r.number,
    type: { code: r.typeCode as AppealTypeCode, title: r.typeTitle, topic: r.topic as AppealTopic, kind: r.kind },
    department: { id: r.departmentId, code: r.departmentCode as DepartmentCode, name: r.departmentName },
    status: r.status, slaDueAt: r.slaDueAt, overdue: isAppealOverdue(r, now),
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

type PersonCols = { lastName: string | null; firstName: string | null; middleName: string | null; stress?: unknown };
const asPerson = (p: PersonCols): Person | null =>
  p.lastName !== null && p.firstName !== null
    ? { lastName: p.lastName, firstName: p.firstName, middleName: p.middleName, stress: p.stress } : null;

/**
 * Карточка обращения, если оно попадает в `scope` (studentScope / staffScope). Таймлайн и переписка
 * читаются только после того, как само обращение найдено в пределах видимости.
 */
export async function loadAppealDetail(
  scope: SQL, id: string, now: Date, showStress = false,
): Promise<{ detail: AppealDetail; studentId: number } | null> {
  const [row] = await db
    .select({
      ...listColumns,
      studentId: appeals.studentId, fields: appeals.fields, pickupPlace: appeals.pickupPlace,
      pickupUntil: appeals.pickupUntil, rejectReason: appeals.rejectReason,
      assigneeLast: staff.lastName, assigneeFirst: staff.firstName, assigneeMiddle: staff.middleName,
      assigneeStress: staff.nameStress,
    })
    .from(appeals)
    .innerJoin(appealTypes, eq(appealTypes.code, appeals.typeCode))
    .innerJoin(departments, eq(departments.id, appeals.departmentId))
    .leftJoin(staff, eq(staff.id, appeals.assigneeStaffId))
    .where(and(eq(appeals.id, id), scope))
    .limit(1);
  if (!row) return null;

  const fields = (row.fields ?? {}) as Record<string, unknown>;
  const [events, messages, disciplineName] = await Promise.all([
    loadEvents(id, showStress), loadMessages(id, showStress), loadDisciplineName(fields.disciplineId),
  ]);
  const assignee = asPerson({
    lastName: row.assigneeLast, firstName: row.assigneeFirst, middleName: row.assigneeMiddle, stress: row.assigneeStress,
  });
  const detail: AppealDetail = {
    ...toListItem(row, now),
    fields,
    disciplineName,
    pickup: row.pickupPlace !== null && row.pickupUntil !== null ? { place: row.pickupPlace, until: row.pickupUntil } : null,
    rejectReason: row.rejectReason,
    assignee: assignee ? staffDisplayName(assignee, showStress) : null,
    events,
    messages,
  };
  return { detail, studentId: row.studentId };
}

/** disciplineId при создании проверен по записям самого студента; здесь — только название для карточки. */
async function loadDisciplineName(disciplineId: unknown): Promise<string | null> {
  if (typeof disciplineId !== "number" || !Number.isInteger(disciplineId)) return null;
  const [d] = await db.select({ name: disciplines.name }).from(disciplines).where(eq(disciplines.id, disciplineId));
  return d?.name ?? null;
}

const personColumns = {
  stLast: students.lastName, stFirst: students.firstName, stMiddle: students.middleName,
  sfLast: staff.lastName, sfFirst: staff.firstName, sfMiddle: staff.middleName,
  stStress: students.nameStress, sfStress: staff.nameStress,
};
type PersonRow = {
  stLast: string | null; stFirst: string | null; stMiddle: string | null;
  sfLast: string | null; sfFirst: string | null; sfMiddle: string | null;
  stStress: unknown; sfStress: unknown;
};

function whoIs(r: PersonRow, show: boolean): { role: "student" | "staff"; name: string } | null {
  const sf = asPerson({ lastName: r.sfLast, firstName: r.sfFirst, middleName: r.sfMiddle, stress: r.sfStress });
  if (sf) return { role: "staff", name: staffDisplayName(sf, show) };
  const st = asPerson({ lastName: r.stLast, firstName: r.stFirst, middleName: r.stMiddle, stress: r.stStress });
  if (st) return { role: "student", name: studentFullName(st, show) };
  return null;
}

async function loadEvents(appealId: string, show: boolean): Promise<AppealEventView[]> {
  const rows = await db
    .select({ kind: appealEvents.kind, text: appealEvents.text, at: appealEvents.createdAt, ...personColumns })
    .from(appealEvents)
    .leftJoin(students, eq(students.userId, appealEvents.actorUserId))
    .leftJoin(staff, eq(staff.userId, appealEvents.actorUserId))
    .where(eq(appealEvents.appealId, appealId))
    .orderBy(asc(appealEvents.createdAt), asc(appealEvents.id));
  return rows.map((r) => {
    const who = whoIs(r, show);
    const base = { kind: r.kind as AppealEventKind, text: r.text, at: r.at };
    return who ? { ...base, actor: who.role, actorName: who.name } : { ...base, actor: "system" as const };
  });
}

async function loadMessages(appealId: string, show: boolean): Promise<AppealMessageView[]> {
  const rows = await db
    .select({ id: appealMessages.id, body: appealMessages.body, at: appealMessages.createdAt, ...personColumns })
    .from(appealMessages)
    .leftJoin(students, eq(students.userId, appealMessages.authorUserId))
    .leftJoin(staff, eq(staff.userId, appealMessages.authorUserId))
    .where(eq(appealMessages.appealId, appealId))
    .orderBy(asc(appealMessages.createdAt), asc(appealMessages.id));
  return rows.map((r) => {
    const who = whoIs(r, show);
    return { id: r.id, body: r.body, at: r.at, author: who?.role ?? "student", authorName: who?.name ?? "" };
  });
}
