import { desc, eq } from "drizzle-orm";
import type { StudentViewer } from "./auth/viewer";
import { audienceFilter } from "./audience";
import { db } from "./db/client";
import { announcements, faculties, groups } from "./db/schema";

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
