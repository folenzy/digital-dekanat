import { and, gte, lte } from "drizzle-orm";
import type { StudentViewer } from "./auth/viewer";
import { audienceFilter } from "./audience";
import { db } from "./db/client";
import { deadlines } from "./db/schema";
import { currentSemester, listRequiredOpenCheckpoints } from "./grades";
import { mskAt, mskDateKey, shiftDateKey } from "./time";

export type DeadlineView = {
  kind: "deadline" | "checkpoint"; title: string; due: Date; href?: string;
  /** Начало окна (только для kind = deadline) и код подтипа обращения, к которому оно относится. */
  startsAt?: Date; appealTypeCode?: string;
};

const DAY_MS = 86_400_000;

/**
 * Что скоро: окна и сроки из `deadlines` для аудитории студента (идут сейчас или откроются в течение
 * `days` суток) и его невыполненные обязательные контрольные точки текущего семестра со сроком в ближайшие `days` дней.
 */
export async function listUpcomingDeadlines(v: StudentViewer, now: Date, days = 14): Promise<DeadlineView[]> {
  const rows = await db.select().from(deadlines).where(and(
    gte(deadlines.endsAt, now),
    lte(deadlines.startsAt, new Date(now.getTime() + days * DAY_MS)),
    audienceFilter({
      facultyId: deadlines.audienceFacultyId, course: deadlines.audienceCourse, groupId: deadlines.audienceGroupId,
    }, v),
  ));

  const today = mskDateKey(now);
  const checkpoints = await listRequiredOpenCheckpoints(v, currentSemester(v.course, now));

  const items: DeadlineView[] = [
    ...rows.map((d): DeadlineView => ({
      kind: "deadline", title: d.title, due: d.endsAt, startsAt: d.startsAt,
      ...(d.appealTypeCode ? { appealTypeCode: d.appealTypeCode } : {}),
      ...(d.appealTypeCode ? { href: `/dekanat/new?type=${d.appealTypeCode}` } : {}),
    })),
    ...checkpoints
      .filter((c) => c.dueDate >= today && c.dueDate <= shiftDateKey(today, days))
      .map((c): DeadlineView => ({
        kind: "checkpoint", title: `${c.discipline}: ${c.title}`, due: mskAt(c.dueDate, "23:59"), href: "/study",
      })),
  ];
  return items.sort((a, b) => +a.due - +b.due);
}
