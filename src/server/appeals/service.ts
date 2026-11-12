import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { StudentViewer } from "../auth/viewer";
import { db } from "../db/client";
import { appealMessages, appeals, appealTypes, departments, enrollments } from "../db/schema";
import { LIMITS, releaseAction, reserveAction } from "../limits";
import { addEvent, runAppealAction, studentScope } from "./access";
import { listColumns, loadAppealDetail, toListItem } from "./detail";
import { departmentStaffUserIds, excerpt, insertNotifications, publishSafe, staffHref } from "./notify";
import { fail, fieldError, fieldErrorsOf, isUuid, ok, type AppealActionResult, type Result } from "./result";
import { slaDueAt } from "./sla";
import {
  APPEAL_TYPES, isAppealTypeCode, messageTextSchema, type AppealDetail, type AppealListItem, type AppealStatus,
} from "./types";

// Обращения со стороны студента. studentId всегда из Viewer; id обращения от клиента — только ключ поиска.

const DUPLICATE_WINDOW_MS = 10_000;
const ACTIVE: AppealStatus[] = ["submitted", "in_progress", "needs_info", "ready"];
const DONE: AppealStatus[] = ["rejected", "closed"];

export type CreatedAppeal = { id: string; number: string };

type Select = Pick<typeof db, "select">;

/** То же обращение (тип и JSON-равные поля), созданное этим студентом за последние 10 с. */
async function findDuplicate(
  q: Select, studentId: number, typeCode: string, fields: Record<string, unknown>, now: Date,
): Promise<CreatedAppeal | null> {
  const [row] = await q.select({ id: appeals.id, number: appeals.number }).from(appeals)
    .where(and(
      eq(appeals.studentId, studentId), eq(appeals.typeCode, typeCode),
      sql`${appeals.fields} = ${JSON.stringify(fields)}::jsonb`,
      gt(appeals.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
    ))
    .orderBy(desc(appeals.createdAt))
    .limit(1);
  return row ?? null;
}

async function isOwnDiscipline(studentId: number, disciplineId: number): Promise<boolean> {
  const rows = await db.select({ id: enrollments.id }).from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.disciplineId, disciplineId)))
    .limit(1);
  return rows.length > 0;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Новое обращение: проверка полей подтипа, маршрут в отдел и срок по appeal_types, событие `submitted`,
 * уведомления сотрудникам отдела. Повтор того же за 10 с (двойной тап) возвращает уже созданное
 * и лимит не тратит. Лимит — 10 обращений в час.
 */
export async function createAppeal(
  v: StudentViewer, typeCode: string, fields: unknown, now: Date = new Date(),
): Promise<Result<CreatedAppeal>> {
  if (v?.role !== "student") return fail("not_found");
  if (!isAppealTypeCode(typeCode)) return fail("validation", { typeCode: "Выбери тип обращения" });
  const parsed = APPEAL_TYPES[typeCode].fields.safeParse(fields);
  if (!parsed.success) return fail("validation", fieldErrorsOf(parsed.error));
  const data: Record<string, unknown> = parsed.data;
  if (typeof data.disciplineId === "number" && !(await isOwnDiscipline(v.studentId, data.disciplineId))) {
    return fail("validation", { disciplineId: "Выбери дисциплину из своего списка" });
  }

  const duplicate = await findDuplicate(db, v.studentId, typeCode, data, now);
  if (duplicate) return ok(duplicate);

  const { action, limit, windowMs } = LIMITS.appeal;
  const reservation = await reserveAction(v.userId, action, limit, windowMs, now);
  if (reservation === null) return fail("rate_limited");

  const res = await db.transaction(async (tx) => {
    // Создание обращений одного студента — по очереди: второй из параллельных запросов увидит первый.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('appeals:create'), ${v.studentId}::int)`);
    const again = await findDuplicate(tx, v.studentId, typeCode, data, now);
    if (again) return { appeal: again, created: false as const };

    const [type] = await tx
      .select({
        departmentId: appealTypes.departmentId, slaDays: appealTypes.slaDays, title: appealTypes.title,
        departmentName: departments.name,
      })
      .from(appealTypes)
      .innerJoin(departments, eq(departments.id, appealTypes.departmentId))
      .where(eq(appealTypes.code, typeCode));
    if (!type) throw new Error(`Подтип ${typeCode} не найден в appeal_types`);

    const [appeal] = await tx.insert(appeals).values({
      studentId: v.studentId, typeCode, departmentId: type.departmentId, status: "submitted", fields: data,
      slaDueAt: slaDueAt(type.slaDays, now), createdAt: now, updatedAt: now,
    }).returning({ id: appeals.id, number: appeals.number });
    await addEvent(tx, appeal.id, v.userId, "submitted", null, now);

    const staffIds = await departmentStaffUserIds(tx, type.departmentId);
    const title = `Новое обращение ${appeal.number}`;
    await insertNotifications(tx, staffIds, {
      kind: "appeal_new", title, body: `${type.title}, ${lowerFirst(type.departmentName)}.`, href: staffHref(appeal.id),
    }, now);
    return { appeal, created: true as const, staffIds, title };
  });

  if (!res.created) {
    await releaseAction(reservation);
    return ok(res.appeal);
  }
  await publishSafe(res.staffIds, {
    type: "notification", title: res.title, href: staffHref(res.appeal.id), appealId: res.appeal.id,
  });
  return ok(res.appeal);
}

/** Мои обращения: active — до получения результата (в т. ч. ready), done — rejected и closed. */
export async function listMyAppeals(
  v: StudentViewer, filter: "active" | "done", now: Date = new Date(),
): Promise<AppealListItem[]> {
  if (filter !== "active" && filter !== "done") return [];
  const rows = await db.select(listColumns).from(appeals)
    .innerJoin(appealTypes, eq(appealTypes.code, appeals.typeCode))
    .innerJoin(departments, eq(departments.id, appeals.departmentId))
    .where(and(studentScope(v), inArray(appeals.status, filter === "active" ? ACTIVE : DONE)))
    .orderBy(desc(appeals.updatedAt), desc(appeals.createdAt));
  return rows.map((r) => toListItem(r, now));
}

/** Карточка своего обращения; чужое, несуществующее или кривой id → null (страница 404). */
export async function getMyAppeal(v: StudentViewer, id: string, now: Date = new Date()): Promise<AppealDetail | null> {
  if (!isUuid(id)) return null;
  return (await loadAppealDetail(studentScope(v), id, now, v.showStress))?.detail ?? null;
}

/**
 * Сообщение студента в переписку (1–2000 символов, лимит 30 в час). Ответ на уточнение (needs_info)
 * возвращает обращение в работу с новым сроком от момента ответа. В rejected / closed → `closed`.
 */
export async function postStudentMessage(
  v: StudentViewer, id: string, text: string, now: Date = new Date(),
): Promise<AppealActionResult> {
  if (!isUuid(id)) return fail("not_found");
  const body = messageTextSchema.safeParse(text);
  if (!body.success) return fail("validation", fieldError("text", body.error));

  return runAppealAction({
    scope: studentScope(v), id, now, actorUserId: v.userId, counterpart: "staff", limit: LIMITS.message,
    check: (a) => (a.status === "rejected" || a.status === "closed" ? fail("closed") : null),
    apply: async (tx, a) => {
      const answering = a.status === "needs_info";
      const status: AppealStatus = answering ? "in_progress" : a.status;
      await tx.update(appeals)
        .set(answering ? { status, slaDueAt: slaDueAt(a.slaDays, now), updatedAt: now } : { updatedAt: now })
        .where(eq(appeals.id, a.id));
      if (answering) await addEvent(tx, a.id, v.userId, "answered", null, now);
      await tx.insert(appealMessages).values({ appealId: a.id, authorUserId: v.userId, body: body.data, createdAt: now });
      return {
        status,
        notice: {
          kind: "appeal_message",
          title: answering ? `Студент ответил на уточнение по обращению ${a.number}` : `Новое сообщение по обращению ${a.number}`,
          body: excerpt(body.data),
        },
      };
    },
  });
}

/** «Получил»: ready → closed. */
export async function confirmReceived(v: StudentViewer, id: string, now: Date = new Date()): Promise<AppealActionResult> {
  if (!isUuid(id)) return fail("not_found");
  return runAppealAction({
    scope: studentScope(v), id, now, actorUserId: v.userId, counterpart: "staff",
    check: (a) => (a.status === "ready" ? null : fail("bad_transition")),
    apply: async (tx, a) => {
      await tx.update(appeals).set({ status: "closed", closedAt: now, updatedAt: now }).where(eq(appeals.id, a.id));
      await addEvent(tx, a.id, v.userId, "closed", null, now);
      return { status: "closed" };
    },
  });
}
