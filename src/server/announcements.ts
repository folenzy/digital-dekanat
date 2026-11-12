import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { StaffViewer, StudentViewer } from "./auth/viewer";
import { excerpt, insertNotifications, publishSafe } from "./appeals/notify";
import { fail, fieldErrorsOf, ok, type Result } from "./appeals/result";
import { consumeAction, LIMITS } from "./limits";
import { audienceFilter } from "./audience";
import { db } from "./db/client";
import { dbId } from "./db/ids";
import { announcements, faculties, groups, staff, students, users } from "./db/schema";
import { cleanMuted } from "./settings-options";

export type AnnouncementView = {
  id: number; title: string; body: string; important: boolean; publishedAt: Date;
  /** Кому адресовано: «Всем» или сочетание факультета, курса и группы. */
  audience: string;
};

/** Объявления, адресованные студенту: каждое непустое поле аудитории совпадает; важные первыми, затем новые. */
export async function listAnnouncementsFor(v: StudentViewer): Promise<AnnouncementView[]> {
  const rows = await db
    .select({
      id: announcements.id, title: announcements.title, body: announcements.body,
      important: announcements.important, publishedAt: announcements.publishedAt,
      course: announcements.audienceCourse, faculty: faculties.code, group: groups.name,
    })
    .from(announcements)
    .leftJoin(faculties, eq(faculties.id, announcements.audienceFacultyId))
    .leftJoin(groups, eq(groups.id, announcements.audienceGroupId))
    .where(audienceFilter({
      facultyId: announcements.audienceFacultyId, course: announcements.audienceCourse,
      groupId: announcements.audienceGroupId,
    }, v))
    .orderBy(desc(announcements.important), desc(announcements.publishedAt), desc(announcements.id));

  return rows.map((r) => ({
    id: r.id, title: r.title, body: r.body, important: r.important, publishedAt: r.publishedAt,
    audience: audienceText(r),
  }));
}

/** Подпись аудитории: «Всем» или факультет (код), курс, группа — те, что заданы. */
function audienceText(r: { faculty: string | null; course: number | null; group: string | null }): string {
  const parts = [r.faculty, r.course === null ? null : `${r.course} курс`, r.group].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Всем";
}

export type StaffAnnouncementView = AnnouncementView & {
  /** Кто опубликовал: «Ирина Белова». */
  author: string;
};

/** Все опубликованные объявления для кабинета сотрудника, новые сверху. Не сотрудник → пусто. */
export async function listAllAnnouncements(v: StaffViewer): Promise<StaffAnnouncementView[]> {
  if (v?.role !== "staff") return [];
  const rows = await db
    .select({
      id: announcements.id, title: announcements.title, body: announcements.body,
      important: announcements.important, publishedAt: announcements.publishedAt,
      course: announcements.audienceCourse, faculty: faculties.code, group: groups.name,
      authorFirst: staff.firstName, authorLast: staff.lastName,
    })
    .from(announcements)
    .innerJoin(staff, eq(staff.id, announcements.authorStaffId))
    .leftJoin(faculties, eq(faculties.id, announcements.audienceFacultyId))
    .leftJoin(groups, eq(groups.id, announcements.audienceGroupId))
    .orderBy(desc(announcements.publishedAt), desc(announcements.id));
  return rows.map((r) => ({
    id: r.id, title: r.title, body: r.body, important: r.important, publishedAt: r.publishedAt,
    audience: audienceText(r), author: `${r.authorFirst} ${r.authorLast}`,
  }));
}

export type AudienceOptions = {
  faculties: { id: number; code: string; name: string }[];
  courses: number[];
  groups: { id: number; name: string; course: number; facultyId: number }[];
};

/** Курсы, которые можно выбрать в аудитории объявления (как в схеме: 1–6). */
const COURSES = [1, 2, 3, 4, 5, 6];

/** Справочник для формы объявления: факультеты, курсы, группы (не персональные данные). */
export async function listAudienceOptions(): Promise<AudienceOptions> {
  const [fs, gs] = await Promise.all([
    db.select({ id: faculties.id, code: faculties.code, name: faculties.name }).from(faculties).orderBy(asc(faculties.id)),
    db.select({ id: groups.id, name: groups.name, course: groups.course, facultyId: groups.facultyId })
      .from(groups).orderBy(asc(groups.course), asc(groups.name)),
  ]);
  return { faculties: fs, courses: COURSES, groups: gs };
}

const optionalId = dbId.optional();
const createSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(3000),
  important: z.boolean(),
  audience: z.object({
    facultyId: optionalId,
    course: z.number().int().min(1).max(6).optional(),
    groupId: optionalId,
  }),
});
export type CreateAnnouncementInput = z.input<typeof createSchema>;

const HREF = "/notifications?tab=announcements";
const INSERT_CHUNK = 1000;

/**
 * Объявление от сотрудника: пишет его, создаёт уведомление каждому студенту аудитории и шлёт им realtime-событие.
 * Пустое поле аудитории = «любой»; несуществующий факультет/группа → validation.
 * recipients — сколько студентов получили уведомление (для «Опубликовано: увидят N студентов»).
 */
export async function createAnnouncement(
  v: StaffViewer, input: CreateAnnouncementInput, now: Date = new Date(),
): Promise<Result<{ id: number; recipients: number }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrorsOf(parsed.error));
  const { title, body, important, audience } = parsed.data;

  const errors: Record<string, string> = {};
  if (audience.facultyId !== undefined) {
    const [f] = await db.select({ id: faculties.id }).from(faculties).where(eq(faculties.id, audience.facultyId));
    if (!f) errors["audience.facultyId"] = "Такого факультета нет";
  }
  if (audience.groupId !== undefined) {
    const [g] = await db.select({ facultyId: groups.facultyId, course: groups.course })
      .from(groups).where(eq(groups.id, audience.groupId));
    if (!g) errors["audience.groupId"] = "Такой группы нет";
    else if (
      (audience.facultyId !== undefined && audience.facultyId !== g.facultyId) ||
      (audience.course !== undefined && audience.course !== g.course)
    ) errors["audience.groupId"] = "Группа не подходит под факультет или курс";
  }
  if (Object.keys(errors).length > 0) return fail("validation", errors);

  const { action, limit, windowMs } = LIMITS.announcement;
  if (!(await consumeAction(v.userId, action, limit, windowMs, now))) return fail("rate_limited");

  const recipients = await db.transaction(async (tx) => {
    const [row] = await tx.insert(announcements).values({
      authorStaffId: v.staffId, title, body, important, publishedAt: now,
      audienceFacultyId: audience.facultyId ?? null, audienceCourse: audience.course ?? null,
      audienceGroupId: audience.groupId ?? null,
    }).returning({ id: announcements.id });

    const targets = await tx.select({ userId: students.userId, muted: users.notifyMuted }).from(students)
      .innerJoin(groups, eq(groups.id, students.groupId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(
        audience.facultyId === undefined ? undefined : eq(groups.facultyId, audience.facultyId),
        audience.course === undefined ? undefined : eq(groups.course, audience.course),
        audience.groupId === undefined ? undefined : eq(groups.id, audience.groupId),
      ));
    const userIds = targets.map((t) => t.userId);
    for (let i = 0; i < userIds.length; i += INSERT_CHUNK) {
      await insertNotifications(
        tx, userIds.slice(i, i + INSERT_CHUNK),
        { kind: "announcement", title, body: excerpt(body), href: HREF }, now,
      );
    }
    // Запись-уведомление получает каждый (выключенная категория скрывает её при чтении, а не теряет).
    // Всплывающее событие — только тем, кто объявления не выключил.
    const liveIds = targets.filter((t) => !cleanMuted(t.muted).includes("announcements")).map((t) => t.userId);
    return { id: row.id, userIds, liveIds };
  });

  await publishSafe(recipients.liveIds, { type: "announcement", title, href: HREF });
  return ok({ id: recipients.id, recipients: recipients.userIds.length });
}
