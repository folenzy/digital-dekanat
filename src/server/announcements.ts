import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { StaffViewer, StudentViewer } from "./auth/viewer";
import { excerpt, insertNotifications, publishSafe } from "./appeals/notify";
import { fail, fieldErrorsOf, ok, type Result } from "./appeals/result";
import { consumeAction, LIMITS } from "./limits";
import { audienceFilter } from "./audience";
import { db } from "./db/client";
import { announcements, faculties, groups, students } from "./db/schema";

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

  return rows.map((r) => {
    const parts = [r.faculty, r.course === null ? null : `${r.course} курс`, r.group].filter(Boolean);
    return {
      id: r.id, title: r.title, body: r.body, important: r.important, publishedAt: r.publishedAt,
      audience: parts.length ? parts.join(" · ") : "Всем",
    };
  });
}

const optionalId = z.number().int().positive().optional();
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
 */
export async function createAnnouncement(
  v: StaffViewer, input: CreateAnnouncementInput, now: Date = new Date(),
): Promise<Result<{ id: number }>> {
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

    const targets = await tx.select({ userId: students.userId }).from(students)
      .innerJoin(groups, eq(groups.id, students.groupId))
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
    return { id: row.id, userIds };
  });

  await publishSafe(recipients.userIds, { type: "announcement", title, href: HREF });
  return ok({ id: recipients.id });
}
