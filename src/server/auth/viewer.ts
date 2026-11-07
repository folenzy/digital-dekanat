import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "../db/client";
import { groups, staff, staffDepartments, students, users } from "../db/schema";
import { SESSION_COOKIE } from "./cookie";
import { getSessionUser } from "./session";

// Кто смотрит. Все функции чтения и записи данных берут studentId/staffId только отсюда.
export type StudentViewer = {
  userId: string; role: "student"; studentId: number; groupId: number; facultyId: number; course: number;
};
export type StaffViewer = { userId: string; role: "staff"; staffId: number; departmentIds: number[] };
export type Viewer = StudentViewer | StaffViewer;

/** Viewer по id пользователя; null, если пользователя или его профиля студента/сотрудника нет. */
export async function viewerForUser(userId: string): Promise<Viewer | null> {
  const [row] = await db
    .select({
      role: users.role, studentId: students.id, groupId: groups.id, facultyId: groups.facultyId,
      course: groups.course, staffId: staff.id,
    })
    .from(users)
    .leftJoin(students, eq(students.userId, users.id))
    .leftJoin(groups, eq(groups.id, students.groupId))
    .leftJoin(staff, eq(staff.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;

  if (row.role === "student") {
    if (row.studentId === null || row.groupId === null || row.facultyId === null || row.course === null) return null;
    return {
      userId, role: "student", studentId: row.studentId, groupId: row.groupId,
      facultyId: row.facultyId, course: row.course,
    };
  }

  if (row.staffId === null) return null;
  const deps = await db
    .select({ id: staffDepartments.departmentId })
    .from(staffDepartments)
    .where(eq(staffDepartments.staffId, row.staffId))
    .orderBy(staffDepartments.departmentId);
  return { userId, role: "staff", staffId: row.staffId, departmentIds: deps.map((d) => d.id) };
}

// Один запрос к БД на рендер страницы, сколько бы раз ни вызывали require*/getViewer.
const resolveViewer = cache(async (): Promise<{ hasCookie: boolean; viewer: Viewer | null }> => {
  const token = (await cookies()).get(SESSION_COOKIE.name)?.value;
  if (!token) return { hasCookie: false, viewer: null };
  const session = await getSessionUser(token, new Date());
  return { hasCookie: true, viewer: session ? await viewerForUser(session.userId) : null };
});

export async function getViewer(): Promise<Viewer | null> {
  return (await resolveViewer()).viewer;
}

/** Нет cookie → /login; cookie есть, а сессии нет (истекла, сброс демо) → /login?reason=expired. */
async function requireViewer(): Promise<Viewer> {
  const { hasCookie, viewer } = await resolveViewer();
  if (!viewer) redirect(hasCookie ? "/login?reason=expired" : "/login");
  return viewer;
}

/** Только студент; сотруднику — 404 (не раскрываем существование страниц). */
export async function requireStudent(): Promise<StudentViewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "student") notFound();
  return viewer;
}

/** Только сотрудник; студенту — 404. */
export async function requireStaff(): Promise<StaffViewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "staff") notFound();
  return viewer;
}
