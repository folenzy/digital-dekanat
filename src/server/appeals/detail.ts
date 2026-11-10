import "server-only";
import { and, asc, eq, type SQL } from "drizzle-orm";
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

type Person = { lastName: string; firstName: string; middleName: string | null };

/** Студент — официально: «Миронова Алина Сергеевна». */
export function studentFullName(p: Person): string {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
}

/** Сотрудник — как представляется студенту: «Ирина Николаевна Белова». */
export function staffDisplayName(p: Person): string {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
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

type PersonCols = { lastName: string | null; firstName: string | null; middleName: string | null };
const asPerson = (p: PersonCols): Person | null =>
  p.lastName !== null && p.firstName !== null ? { lastName: p.lastName, firstName: p.firstName, middleName: p.middleName } : null;

/**
 * Карточка обращения, если оно попадает в `scope` (studentScope / staffScope). Таймлайн и переписка
 * читаются только после того, как само обращение найдено в пределах видимости.
 */
export async function loadAppealDetail(
  scope: SQL, id: string, now: Date,
): Promise<{ detail: AppealDetail; studentId: number } | null> {
  const [row] = await db
    .select({
      ...listColumns,
      studentId: appeals.studentId, fields: appeals.fields, pickupPlace: appeals.pickupPlace,
      pickupUntil: appeals.pickupUntil, rejectReason: appeals.rejectReason,
      assigneeLast: staff.lastName, assigneeFirst: staff.firstName, assigneeMiddle: staff.middleName,
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
    loadEvents(id), loadMessages(id), loadDisciplineName(fields.disciplineId),
  ]);
  const assignee = asPerson({ lastName: row.assigneeLast, firstName: row.assigneeFirst, middleName: row.assigneeMiddle });
  const detail: AppealDetail = {
    ...toListItem(row, now),
    fields,
    disciplineName,
    pickup: row.pickupPlace !== null && row.pickupUntil !== null ? { place: row.pickupPlace, until: row.pickupUntil } : null,
    rejectReason: row.rejectReason,
    assignee: assignee ? staffDisplayName(assignee) : null,
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
};
type PersonRow = { [K in keyof typeof personColumns]: string | null };

function whoIs(r: PersonRow): { role: "student" | "staff"; name: string } | null {
  const sf = asPerson({ lastName: r.sfLast, firstName: r.sfFirst, middleName: r.sfMiddle });
  if (sf) return { role: "staff", name: staffDisplayName(sf) };
  const st = asPerson({ lastName: r.stLast, firstName: r.stFirst, middleName: r.stMiddle });
  if (st) return { role: "student", name: studentFullName(st) };
  return null;
}

async function loadEvents(appealId: string): Promise<AppealEventView[]> {
  const rows = await db
    .select({ kind: appealEvents.kind, text: appealEvents.text, at: appealEvents.createdAt, ...personColumns })
    .from(appealEvents)
    .leftJoin(students, eq(students.userId, appealEvents.actorUserId))
    .leftJoin(staff, eq(staff.userId, appealEvents.actorUserId))
    .where(eq(appealEvents.appealId, appealId))
    .orderBy(asc(appealEvents.createdAt), asc(appealEvents.id));
  return rows.map((r) => {
    const who = whoIs(r);
    const base = { kind: r.kind as AppealEventKind, text: r.text, at: r.at };
    return who ? { ...base, actor: who.role, actorName: who.name } : { ...base, actor: "system" as const };
  });
}

async function loadMessages(appealId: string): Promise<AppealMessageView[]> {
  const rows = await db
    .select({ id: appealMessages.id, body: appealMessages.body, at: appealMessages.createdAt, ...personColumns })
    .from(appealMessages)
    .leftJoin(students, eq(students.userId, appealMessages.authorUserId))
    .leftJoin(staff, eq(staff.userId, appealMessages.authorUserId))
    .where(eq(appealMessages.appealId, appealId))
    .orderBy(asc(appealMessages.createdAt), asc(appealMessages.id));
  return rows.map((r) => {
    const who = whoIs(r);
    return { id: r.id, body: r.body, at: r.at, author: who?.role ?? "student", authorName: who?.name ?? "" };
  });
}
