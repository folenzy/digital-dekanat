import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { appealTypes, departments } from "../db/schema";
import { isAppealTypeCode, type AppealTypeCode, type DepartmentCode, type DepartmentInfo } from "./types";

// Справочник подтипов: куда уходит обращение и какой срок. Не данные студента — Viewer не нужен.

export type AppealRoute = { department: DepartmentInfo; slaDays: number };

/** Отдел и срок подтипа из appeal_types (так же маршрутизирует createAppeal); неизвестный код → null. */
export async function getAppealRoute(code: AppealTypeCode): Promise<AppealRoute | null> {
  if (!isAppealTypeCode(code)) return null;
  const [row] = await db
    .select({ id: departments.id, code: departments.code, name: departments.name, slaDays: appealTypes.slaDays })
    .from(appealTypes)
    .innerJoin(departments, eq(departments.id, appealTypes.departmentId))
    .where(eq(appealTypes.code, code))
    .limit(1);
  if (!row) return null;
  return { department: { id: row.id, code: row.code as DepartmentCode, name: row.name }, slaDays: row.slaDays };
}
