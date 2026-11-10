import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { StudentViewer } from "./auth/viewer";
import { db } from "./db/client";
import { disciplines, rooms, scheduleChanges, scheduleSlots, teachers } from "./db/schema";
import { mskAt, mskDateKey, mskMinutes, mskWeekday, shiftDateKey, toMin, weekParity } from "./time";

export const PAIR_TIMES: Record<number, readonly [start: string, end: string]> = {
  1: ["09:00", "10:30"],
  2: ["10:40", "12:10"],
  3: ["12:40", "14:10"],
  4: ["14:20", "15:50"],
  5: ["16:00", "17:30"],
  6: ["17:40", "19:10"],
};

export type LessonChange = {
  kind: "moved" | "cancelled" | "teacher" | "room" | "extra";
  was?: { room?: string; teacher?: string; start?: string };
  note?: string;
};

export type Lesson = {
  pair: number; start: string; end: string; discipline: string;
  type: "lecture" | "practice" | "lab"; room: string; building: string | null; teacher: string;
  change?: LessonChange; cancelled: boolean;
};

const noonOf = (key: string) => mskAt(key, "12:00");
const UNKNOWN = "уточняется";

type Item = Lesson & { origPair: number };

/** Занятия группы на набор дат: недельный шаблон по чётности + изменения на конкретные даты. */
async function loadLessons(groupId: number, keys: string[]): Promise<Map<string, Lesson[]>> {
  const changeRoom = alias(rooms, "change_room");
  const changeTeacher = alias(teachers, "change_teacher");

  const [slots, changes] = await Promise.all([
    db.select({
      weekday: scheduleSlots.weekday, parity: scheduleSlots.parity, pair: scheduleSlots.pair,
      type: scheduleSlots.lessonType, discipline: disciplines.name, room: rooms.name,
      building: rooms.building, teacher: teachers.fullName,
    })
      .from(scheduleSlots)
      .innerJoin(disciplines, eq(disciplines.id, scheduleSlots.disciplineId))
      .innerJoin(rooms, eq(rooms.id, scheduleSlots.roomId))
      .innerJoin(teachers, eq(teachers.id, scheduleSlots.teacherId))
      .where(eq(scheduleSlots.groupId, groupId)),
    db.select({
      date: scheduleChanges.date, pair: scheduleChanges.pair, kind: scheduleChanges.kind,
      newPair: scheduleChanges.newPair, note: scheduleChanges.note, lessonType: scheduleChanges.lessonType,
      extraDiscipline: disciplines.name, newRoom: changeRoom.name, newBuilding: changeRoom.building,
      newTeacher: changeTeacher.fullName,
    })
      .from(scheduleChanges)
      .leftJoin(changeRoom, eq(changeRoom.id, scheduleChanges.newRoomId))
      .leftJoin(changeTeacher, eq(changeTeacher.id, scheduleChanges.newTeacherId))
      .leftJoin(disciplines, eq(disciplines.id, scheduleChanges.disciplineId))
      .where(and(eq(scheduleChanges.groupId, groupId), inArray(scheduleChanges.date, keys)))
      .orderBy(scheduleChanges.id),
  ]);

  const result = new Map<string, Lesson[]>();
  for (const key of keys) {
    const noon = noonOf(key);
    const wd = mskWeekday(noon);
    const parity = weekParity(noon);
    const items: Item[] = slots
      .filter((x) => x.weekday === wd && (x.parity === "both" || x.parity === parity))
      .map((x) => ({
        pair: x.pair, origPair: x.pair, start: PAIR_TIMES[x.pair][0], end: PAIR_TIMES[x.pair][1],
        discipline: x.discipline, type: x.type, room: x.room, building: x.building, teacher: x.teacher,
        cancelled: false,
      }));

    for (const c of changes.filter((x) => x.date === key)) {
      if (c.kind === "extra") {
        const pair = c.pair;
        items.push({
          pair, origPair: pair, start: PAIR_TIMES[pair][0], end: PAIR_TIMES[pair][1],
          discipline: c.extraDiscipline ?? UNKNOWN, type: c.lessonType ?? "lecture",
          room: c.newRoom ?? UNKNOWN, building: c.newBuilding ?? null, teacher: c.newTeacher ?? UNKNOWN,
          cancelled: false, change: { kind: "extra", ...(c.note ? { note: c.note } : {}) },
        });
        continue;
      }
      const lesson = items.find((x) => x.origPair === c.pair);
      if (!lesson) continue;
      const was: NonNullable<LessonChange["was"]> = { ...lesson.change?.was };
      if (c.kind === "cancelled") lesson.cancelled = true;
      if ((c.kind === "room" || c.kind === "moved") && c.newRoom && c.newRoom !== lesson.room) {
        was.room = lesson.room;
        lesson.room = c.newRoom;
        lesson.building = c.newBuilding ?? null;
      }
      if (c.kind === "teacher" && c.newTeacher) {
        was.teacher = lesson.teacher;
        lesson.teacher = c.newTeacher;
      }
      if (c.kind === "moved" && c.newPair) {
        was.start = lesson.start;
        lesson.pair = c.newPair;
        lesson.start = PAIR_TIMES[c.newPair][0];
        lesson.end = PAIR_TIMES[c.newPair][1];
      }
      lesson.change = {
        kind: c.kind,
        ...(Object.keys(was).length ? { was } : {}),
        ...((c.note ?? lesson.change?.note) ? { note: (c.note ?? lesson.change?.note)! } : {}),
      };
    }

    result.set(
      key,
      items.sort((a, b) => a.pair - b.pair).map((item): Lesson => { const lesson: Partial<Item> = { ...item }; delete lesson.origPair; return lesson as Lesson; }),
    );
  }
  return result;
}

/** Пары на день (дата — по Москве). Отменённые остаются в списке с `cancelled: true`. */
export async function getDay(v: StudentViewer, date: Date): Promise<Lesson[]> {
  const key = mskDateKey(date);
  return (await loadLessons(v.groupId, [key])).get(key)!;
}

/** Неделя пн–сб, в которую попадает дата. */
export async function getWeek(
  v: StudentViewer, anyDateInWeek: Date,
): Promise<{ days: { dateKey: string; lessons: Lesson[] }[]; parity: "odd" | "even" }> {
  const monday = shiftDateKey(mskDateKey(anyDateInWeek), -(mskWeekday(anyDateInWeek) - 1));
  const keys = Array.from({ length: 6 }, (_, i) => shiftDateKey(monday, i));
  const byDay = await loadLessons(v.groupId, keys);
  return {
    days: keys.map((dateKey) => ({ dateKey, lessons: byDay.get(dateKey)! })),
    parity: weekParity(noonOf(monday)),
  };
}

const SEARCH_DAYS = 14;

/** Пары сегодня, идущая сейчас и ближайшая следующая (сегодня или в ближайшие 14 дней). */
export async function getTodayOverview(
  v: StudentViewer, now: Date,
): Promise<{ lessons: Lesson[]; current?: Lesson; next?: Lesson & { dateKey: string } }> {
  const today = mskDateKey(now);
  const keys = Array.from({ length: SEARCH_DAYS + 1 }, (_, i) => shiftDateKey(today, i));
  const byDay = await loadLessons(v.groupId, keys);
  const lessons = byDay.get(today)!;
  const t = mskMinutes(now);

  const current = lessons.find((l) => !l.cancelled && toMin(l.start) <= t && t <= toMin(l.end));

  let next: (Lesson & { dateKey: string }) | undefined;
  for (const key of keys) {
    const candidate = byDay.get(key)!.find((l) => !l.cancelled && (key !== today || toMin(l.start) > t));
    if (candidate) {
      next = { ...candidate, dateKey: key };
      break;
    }
  }
  return { lessons, ...(current ? { current } : {}), ...(next ? { next } : {}) };
}
