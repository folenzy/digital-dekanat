import { and, eq, isNull, or, type AnyColumn } from "drizzle-orm";
import type { StudentViewer } from "./auth/viewer";

/**
 * Условие «запись предназначена этому студенту»: каждое непустое поле аудитории
 * (факультет, курс, группа) должно совпасть со студентом; null = любой.
 */
export function audienceFilter(
  cols: { facultyId: AnyColumn; course: AnyColumn; groupId: AnyColumn },
  v: StudentViewer,
) {
  return and(
    or(isNull(cols.facultyId), eq(cols.facultyId, v.facultyId)),
    or(isNull(cols.course), eq(cols.course, v.course)),
    or(isNull(cols.groupId), eq(cols.groupId, v.groupId)),
  );
}
