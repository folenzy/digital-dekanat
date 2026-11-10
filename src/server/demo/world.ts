import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { staffHref, studentHref } from "../../lib/hrefs";
import { APPEAL_TYPES } from "../appeals/types";
import { hashPassword } from "../auth/password";
import { db as appDb } from "../db/client";
import * as s from "../db/schema";
import { addWorkingDays, mskDateKey, mskWeekday, weekParity } from "../time";
import { KB_ARTICLES } from "./kb-articles";
import {
  ALINA_ENROLLMENTS, CHANGE_ROOMS, DENIS_ENROLLMENTS, DEPARTMENTS, DISCIPLINES, FACULTIES, GROUPS,
  PROGRAMS, ROOMS, SCHEDULE, SESSION_EXAMS, STAFF_MEMBER, STUDENTS, SUBSTITUTE_TEACHER, TEACHERS,
  type EnrollmentDef,
} from "./people";

type Db = PostgresJsDatabase<typeof s>;
export type DemoPasswords = { alina: string; denis: string; irina: string };

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

/** Ключ даты, сдвинутый на n суток. */
function shiftKey(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Момент времени «ГГГГ-ММ-ДД ЧЧ:ММ» по Москве. */
function mskAt(key: string, hhmm: string): Date {
  return new Date(`${key}T${hhmm}:00+03:00`);
}

function isWeekendKey(key: string): boolean {
  const d = new Date(`${key}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/** Рабочий день (пн–пт), отстоящий на n рабочих дней назад от `key`; сам `key` не считается. */
function workdaysBefore(key: string, n: number): string {
  let k = key;
  for (let left = n; left > 0;) {
    k = shiftKey(k, -1);
    if (!isWeekendKey(k)) left--;
  }
  return k;
}

/** Сам день, если он будний, иначе ближайший следующий будний. */
function rollToWorkday(key: string): string {
  let k = key;
  while (isWeekendKey(k)) k = shiftKey(k, 1);
  return k;
}

const ddmm = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

/** Два ближайших рабочих дня: с сегодняшнего (если пн–пт) или с понедельника. */
function changeDates(now: Date): [string, string] {
  const first = rollToWorkday(mskDateKey(now));
  return [first, rollToWorkday(shiftKey(first, 1))];
}

function lessonsOn(group: string, key: string) {
  const date = new Date(`${key}T09:00:00Z`);
  const wd = mskWeekday(date);
  const parity = weekParity(date);
  return SCHEDULE.filter((x) => x.group === group && x.weekday === wd && (x.parity === "both" || x.parity === parity))
    .sort((a, b) => a.pair - b.pair);
}

function pointsFor(def: EnrollmentDef): number | null {
  if (def.checkpoints) return def.checkpoints.reduce((sum, c) => sum + (c.score ?? 0), 0);
  switch (def.grade) {
    case "5": return 92;
    case "4": return 78;
    case "3": return 63;
    case "2": return 38;
    default: return null;
  }
}

/**
 * Собирает демо-мир относительно `now`: в одной транзакции очищает все таблицы
 * (RESTART IDENTITY, сброс номера обращений) и заполняет заново.
 */
export async function buildDemoWorld(db: Db, now: Date, passwords: DemoPasswords): Promise<void> {
  const [hashAlina, hashDenis, hashIrina] = await Promise.all([
    hashPassword(passwords.alina), hashPassword(passwords.denis), hashPassword(passwords.irina),
  ]);
  const today = mskDateKey(now);
  const day = (n: number) => shiftKey(today, n);

  await db.transaction(async (tx) => {
    // ---------- очистка ----------
    const tables = await tx.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const list = [...tables].map((r) => `"public"."${r.tablename}"`).join(", ");
    await tx.execute(sql.raw(`truncate table ${list} restart identity cascade`));
    await tx.execute(sql.raw("alter sequence appeal_number_seq restart with 1"));

    // ---------- структура вуза ----------
    const faculties = await tx.insert(s.faculties).values([...FACULTIES]).returning();
    const facultyId = new Map(faculties.map((f) => [f.code, f.id]));
    const programs = await tx.insert(s.programs).values(
      PROGRAMS.map((p) => ({ facultyId: facultyId.get(p.faculty)!, code: p.code, name: p.name, profile: p.profile })),
    ).returning();
    const programByKey = new Map(PROGRAMS.map((p, i) => [p.key, programs[i]]));
    const groups = await tx.insert(s.groups).values(
      GROUPS.map((g) => {
        const p = programByKey.get(g.program)!;
        return { facultyId: p.facultyId, programId: p.id, course: g.course, name: g.name };
      }),
    ).returning();
    const groupId = new Map(groups.map((g) => [g.name, g.id]));
    const departments = await tx.insert(s.departments).values([...DEPARTMENTS]).returning();
    const deptId = new Map(departments.map((d) => [d.code, d.id]));

    const teachers = await tx.insert(s.teachers).values(TEACHERS.map((fullName) => ({ fullName }))).returning();
    const teacherId = new Map(teachers.map((t) => [t.fullName, t.id]));
    const disciplines = await tx.insert(s.disciplines).values(DISCIPLINES.map((name) => ({ name }))).returning();
    const disciplineId = new Map(disciplines.map((d) => [d.name, d.id]));
    const rooms = await tx.insert(s.rooms).values([...ROOMS]).returning();
    const roomId = new Map(rooms.map((r) => [r.name, r.id]));

    // ---------- люди ----------
    const [uIrina] = await tx.insert(s.users).values({
      login: STAFF_MEMBER.login, passwordHash: hashIrina, role: "staff", isDemo: true,
    }).returning();
    const [staffIrina] = await tx.insert(s.staff).values({
      userId: uIrina.id, lastName: STAFF_MEMBER.lastName, firstName: STAFF_MEMBER.firstName,
      middleName: STAFF_MEMBER.middleName, position: STAFF_MEMBER.position,
    }).returning();
    await tx.insert(s.staffDepartments).values(
      departments.map((d) => ({ staffId: staffIrina.id, departmentId: d.id })),
    );

    const hashes: Record<string, string | null> = {
      alina: hashAlina, denis: hashDenis, tikhonov: null, sokolova: null, zakharov: null,
    };
    const students: Record<string, { id: number; userId: string }> = {};
    for (const [key, p] of Object.entries(STUDENTS)) {
      const [u] = await tx.insert(s.users).values({
        login: p.login, passwordHash: hashes[key], role: "student", isDemo: true,
      }).returning();
      const [st] = await tx.insert(s.students).values({
        userId: u.id, lastName: p.lastName, firstName: p.firstName, middleName: p.middleName,
        groupId: groupId.get(p.group)!, studyForm: p.studyForm, funding: p.funding,
        recordBookNo: p.recordBookNo, email: p.email, curatorName: p.curatorName,
      }).returning();
      students[key] = { id: st.id, userId: u.id };
    }
    const { alina, denis, tikhonov, sokolova, zakharov } = students;

    // ---------- расписание ----------
    await tx.insert(s.scheduleSlots).values(SCHEDULE.map((x) => ({
      groupId: groupId.get(x.group)!, weekday: x.weekday, parity: x.parity, pair: x.pair,
      disciplineId: disciplineId.get(x.discipline)!, lessonType: x.type,
      roomId: roomId.get(x.room)!, teacherId: teacherId.get(x.teacher)!,
    })));

    const [d1, d2] = changeDates(now);
    const changeRows: (typeof s.scheduleChanges.$inferInsert)[] = [];
    const scheduleNotes: Record<string, string> = {};
    for (const group of ["ПМИ-25-1", "ЭК-24-2"]) {
      const l1 = lessonsOn(group, d1);
      const l2 = lessonsOn(group, d2);
      const gid = groupId.get(group)!;
      const first = l1[0];
      const newRoom = CHANGE_ROOMS.find((r) => r !== first.room)!;
      changeRows.push({
        groupId: gid, date: d1, pair: first.pair, kind: "room", newRoomId: roomId.get(newRoom),
        note: `В аудитории ${first.room} технические работы, пара пройдёт в ${newRoom}`,
      });
      scheduleNotes[group] =
        `${ddmm(d1)}, ${first.pair}-я пара, ${first.discipline}: аудитория ${newRoom} вместо ${first.room}.`;
      changeRows.push({
        groupId: gid, date: d1, pair: l1[l1.length - 1].pair, kind: "cancelled",
        note: "Преподаватель на конференции, пара отменена",
      });
      changeRows.push({
        groupId: gid, date: d2, pair: l2[0].pair, kind: "teacher",
        newTeacherId: teacherId.get(SUBSTITUTE_TEACHER)!, note: "Пару проведёт другой преподаватель",
      });
      const last = l2[l2.length - 1];
      const used = new Set(l2.map((x) => x.pair));
      const freePair = [1, 2, 3, 4, 5].find((p) => !used.has(p))!;
      changeRows.push({
        groupId: gid, date: d2, pair: last.pair, kind: "moved", newPair: freePair,
        newRoomId: roomId.get(last.room), note: `Пара перенесена на ${freePair}-ю, аудитория прежняя`,
      });
    }
    await tx.insert(s.scheduleChanges).values(changeRows);

    // ---------- учёба ----------
    for (const [studentId, defs] of [[alina.id, ALINA_ENROLLMENTS], [denis.id, DENIS_ENROLLMENTS]] as const) {
      for (const def of defs) {
        const [enr] = await tx.insert(s.enrollments).values({
          studentId, disciplineId: disciplineId.get(def.discipline)!, semester: def.semester,
          controlForm: def.form, points: pointsFor(def), finalGrade: def.grade ?? null,
          admitted: def.grade !== undefined ? true : (def.admitted ?? null),
        }).returning();
        if (def.checkpoints) {
          await tx.insert(s.checkpoints).values(def.checkpoints.map((c) => ({
            enrollmentId: enr.id, title: c.title, maxPoints: c.max, score: c.score,
            dueDate: day(c.dueOffset), required: c.required ?? false,
          })));
        }
      }
    }

    await tx.insert(s.exams).values(SESSION_EXAMS.map((e) => ({
      groupId: groupId.get(e.group)!, disciplineId: disciplineId.get(e.discipline)!, kind: e.kind,
      startsAt: mskAt(e.date, e.time), roomId: roomId.get(e.room)!,
    })));
    const retakeDay = rollToWorkday(day(7));
    await tx.insert(s.exams).values({
      groupId: groupId.get("ЭК-24-2")!, disciplineId: disciplineId.get("Статистика")!, kind: "retake",
      startsAt: mskAt(retakeDay, "10:00"), roomId: roomId.get("А-218")!, studentId: denis.id,
    });

    // ---------- обращения ----------
    await tx.insert(s.appealTypes).values(Object.entries(APPEAL_TYPES).map(([code, t]) => ({
      code, topic: t.topic, kind: t.kind, departmentId: deptId.get(t.department)!,
      title: t.title, hint: t.hint, slaDays: t.slaDays,
    })));

    const insertAppeal = async (v: {
      studentId: number; code: keyof typeof APPEAL_TYPES; status: (typeof s.appeals.$inferInsert)["status"];
      created: Date; fields: Record<string, unknown>; assigned?: boolean; firstResponse?: Date;
      updated?: Date; pickupPlace?: string; pickupUntil?: Date;
    }) => {
      const type = APPEAL_TYPES[v.code];
      const [row] = await tx.insert(s.appeals).values({
        studentId: v.studentId, typeCode: v.code, departmentId: deptId.get(type.department)!,
        assigneeStaffId: v.assigned ? staffIrina.id : null, status: v.status, fields: v.fields,
        slaDueAt: addWorkingDays(v.created, type.slaDays), firstResponseAt: v.firstResponse ?? null,
        pickupPlace: v.pickupPlace ?? null, pickupUntil: v.pickupUntil ?? null,
        createdAt: v.created, updatedAt: v.updated ?? v.created,
      }).returning();
      return row;
    };
    const event = (appealId: string, actor: string, kind: string, at: Date, text: string | null = null) =>
      tx.insert(s.appealEvents).values({ appealId, actorUserId: actor, kind, text, createdAt: at });
    const notify = (userId: string, kind: string, title: string, body: string, at: Date, href: string | null, read = false) =>
      tx.insert(s.notifications).values({ userId, kind, title, body, href, createdAt: at, readAt: read ? new Date(at.getTime() + 10 * MIN_MS) : null });

    // Алина: справка для военкомата в работе
    const aCreated = new Date(now.getTime() - 2 * HOUR_MS);
    const aTaken = new Date(aCreated.getTime() + 20 * MIN_MS);
    const aMil = await insertAppeal({
      studentId: alina.id, code: "cert_military", status: "in_progress", created: aCreated, assigned: true,
      firstResponse: aTaken, updated: aTaken,
      fields: { destination: "Военный комиссариат Центрального района", copies: 1, format: "paper" },
    });
    await event(aMil.id, alina.userId, "submitted", aCreated);
    await event(aMil.id, uIrina.id, "taken", aTaken, "Принято в работу");

    // Денис: пересдача ждёт уточнения
    const retakeDate = ddmm(retakeDay);
    const dCreated = new Date(now.getTime() - 20 * HOUR_MS);
    const dTaken = new Date(dCreated.getTime() + 1 * HOUR_MS);
    const dAsked = new Date(dCreated.getTime() + 3 * HOUR_MS);
    const question =
      `Здравствуйте, Денис! Пересдача по статистике у вас уже назначена на ${retakeDate} в 10:00, ауд. А-218. ` +
      "Эта дата вам подходит или нужна другая? Если другая, напишите, в какие дни вы свободны на этой неделе.";
    const dRetake = await insertAppeal({
      studentId: denis.id, code: "study_retake", status: "needs_info", created: dCreated, assigned: true,
      firstResponse: dTaken, updated: dAsked,
      fields: {
        text: "Хочу пересдать статистику, подскажите, когда и как записаться на пересдачу.",
        disciplineId: disciplineId.get("Статистика")!,
      },
    });
    await event(dRetake.id, denis.userId, "submitted", dCreated);
    await event(dRetake.id, uIrina.id, "taken", dTaken, "Принято в работу");
    await event(dRetake.id, uIrina.id, "needs_info", dAsked, question);
    await tx.insert(s.appealMessages).values({
      appealId: dRetake.id, authorUserId: uIrina.id, body: question, createdAt: dAsked,
    });

    // Денис: справка об обучении готова
    const cCreated = new Date(now.getTime() - 27 * HOUR_MS);
    const cTaken = new Date(cCreated.getTime() + 40 * MIN_MS);
    const cReady = new Date(now.getTime() - 4 * HOUR_MS);
    const pickupUntil = mskAt(rollToWorkday(day(5)), "17:00");
    const pickupPlace = "каб. 214, корпус А";
    const dCert = await insertAppeal({
      studentId: denis.id, code: "cert_study", status: "ready", created: cCreated, assigned: true,
      firstResponse: cTaken, updated: cReady, pickupPlace, pickupUntil,
      fields: { destination: "По месту требования", copies: 1, format: "paper" },
    });
    await event(dCert.id, denis.userId, "submitted", cCreated);
    await event(dCert.id, uIrina.id, "taken", cTaken, "Принято в работу");
    await event(dCert.id, uIrina.id, "ready", cReady, `Справка готова. Забрать: ${pickupPlace} до ${ddmm(mskDateKey(pickupUntil))}`);

    // В очереди Ирины: два новых обращения от студентов без логина
    const nStudy = await insertAppeal({
      studentId: tikhonov.id, code: "study_individual_plan", status: "submitted",
      created: new Date(now.getTime() - 3 * HOUR_MS),
      fields: {
        text: "Прошу разрешить свободное посещение до конца семестра: с ноября работаю по графику 2/2, справку с места работы могу принести в единое окно.",
      },
    });
    await event(nStudy.id, tikhonov.userId, "submitted", nStudy.createdAt);
    const nStip = await insertAppeal({
      studentId: sokolova.id, code: "stip_payment_question", status: "submitted",
      created: new Date(now.getTime() - 50 * MIN_MS),
      fields: { text: "Подскажите, почему в октябре стипендия пришла позже обычного и будет ли доплата за этот месяц?" },
    });
    await event(nStip.id, sokolova.userId, "submitted", nStip.createdAt);

    // Просроченное: отправлено за (срок + 1) рабочих дня до сегодня, поэтому срок ответа —
    // 18:00 предыдущего рабочего дня, и в любой час любого дня недели оно уже просрочено.
    const lateType = APPEAL_TYPES.study_other;
    const nLate = await insertAppeal({
      studentId: zakharov.id, code: "study_other", status: "submitted",
      created: mskAt(workdaysBefore(today, lateType.slaDays + 1), "11:20"),
      fields: {
        text: "Физкультура у ЛИН-26-1 стоит в среду третьей парой, одновременно с практикой по английскому. Можно ли перейти в другую группу по физкультуре и куда для этого обратиться?",
      },
    });
    await event(nLate.id, zakharov.userId, "submitted", nLate.createdAt);

    // ---------- дедлайны ----------
    await tx.insert(s.deadlines).values([
      {
        title: "Приём заявлений на повышенную академическую стипендию", kind: "application_window",
        startsAt: mskAt(day(-7), "00:00"), endsAt: mskAt(day(14), "23:59"), appealTypeCode: "stip_increased",
      },
      {
        title: "Обновление справок для социальной стипендии", kind: "documents",
        startsAt: mskAt(day(-2), "00:00"), endsAt: mskAt(day(5), "17:00"), appealTypeCode: "stip_social",
      },
      {
        title: "Выбор темы курсовой работы", kind: "coursework",
        startsAt: mskAt(day(-10), "00:00"), endsAt: mskAt(day(8), "17:00"), audienceCourse: 3,
      },
      {
        title: "Запись на элективные дисциплины следующего семестра", kind: "enrollment",
        startsAt: mskAt(day(-1), "00:00"), endsAt: mskAt(day(10), "23:59"),
        audienceFacultyId: facultyId.get("ФПМИ"),
      },
    ]);

    // ---------- объявления ----------
    await tx.insert(s.announcements).values([
      {
        authorStaffId: staffIrina.id, important: true,
        title: "Зимняя сессия начинается 22 декабря",
        body: "Проверь в разделе «Учёба», какие контрольные точки ещё не сданы. Без обязательных точек допуск к экзамену не ставится. Если что-то непонятно, напиши в «Деканат» или приходи в единое окно: корпус А, каб. 214, пн–пт 10:00–17:00.",
        publishedAt: new Date(now.getTime() - 1 * DAY_MS),
      },
      {
        authorStaffId: staffIrina.id, audienceFacultyId: facultyId.get("ФПМИ"),
        title: "Консультация по математическому анализу",
        body: "Марина Анатольевна Ковалёва проведёт открытую консультацию перед второй контрольной работой. Ждём в ближайший четверг в 16:00, ауд. А-301. Приходи с вопросами по пройденным темам.",
        publishedAt: new Date(now.getTime() - 2 * DAY_MS),
      },
      {
        authorStaffId: staffIrina.id, audienceCourse: 3,
        title: "Документы на производственную практику",
        body: "Студентам 3 курса до конца месяца нужно подать в единое окно заявление на производственную практику. Бланк можно взять в каб. 214 или скачать на сайте университета.",
        publishedAt: new Date(now.getTime() - 3 * DAY_MS),
      },
      {
        authorStaffId: staffIrina.id, audienceGroupId: groupId.get("ЭК-24-2"),
        title: "ЭК-24-2: консультация по эконометрике",
        body: "Виктор Степанович Морозов проведёт консультацию по лабораторным работам в классе Б-14 в пятницу после третьей пары. Возьмите с собой ноутбуки с установленной средой для анализа данных.",
        publishedAt: new Date(now.getTime() - 5 * HOUR_MS),
      },
    ]);

    // ---------- уведомления ----------
    const hAgo = (h: number) => new Date(now.getTime() - h * HOUR_MS);
    await notify(alina.userId, "appeal_status", `Обращение ${aMil.number} принято в работу`,
      "Справку для военкомата готовит Ирина Николаевна Белова. Ответим в обещанный срок.", aTaken, studentHref(aMil.id));
    await notify(alina.userId, "schedule_change", "Изменение в расписании", scheduleNotes["ПМИ-25-1"], hAgo(1), "/schedule");
    await notify(alina.userId, "announcement", "Зимняя сессия начинается 22 декабря",
      "Проверь, какие контрольные точки ещё не сданы.", hAgo(24), "/");
    await notify(alina.userId, "deadline", "Идёт приём заявлений на повышенную стипендию",
      `Заявления принимаем до ${ddmm(day(14))}.`, hAgo(30), "/dekanat/new?type=stip_increased");
    await notify(alina.userId, "announcement", "Добро пожаловать в «На связи»",
      "Здесь расписание, учёба и деканат в одном месте.", hAgo(72), "/", true);

    await notify(denis.userId, "appeal_message", `Нужно уточнение по обращению ${dRetake.number}`,
      "Сотрудник деканата задал вопрос по пересдаче. Ответь, чтобы мы продолжили.", dAsked, studentHref(dRetake.id));
    await notify(denis.userId, "appeal_status", `Справка по обращению ${dCert.number} готова`,
      `Забери справку: ${pickupPlace}, до ${ddmm(mskDateKey(pickupUntil))}.`, cReady, studentHref(dCert.id));
    await notify(denis.userId, "schedule_change", "Изменение в расписании", scheduleNotes["ЭК-24-2"], hAgo(1), "/schedule");
    await notify(denis.userId, "deadline", "Скоро срок сдачи лабораторной работы",
      "Лабораторная работа №3 по эконометрике: срок через 3 дня, работа обязательная для допуска.", hAgo(2), "/study");
    await notify(denis.userId, "announcement", "Документы на производственную практику",
      "Нужно подать заявление в единое окно до конца месяца.", hAgo(72), "/", true);

    // Ирина получает уведомления о новых обращениях в своих отделах
    await notify(uIrina.id, "appeal_new", `Новое обращение ${nStudy.number}`,
      "Индивидуальный график, учебный отдел.", nStudy.createdAt, staffHref(nStudy.id));
    await notify(uIrina.id, "appeal_new", `Новое обращение ${nStip.number}`,
      "Вопрос по выплате, стипендиальный отдел.", nStip.createdAt, staffHref(nStip.id));
    await notify(uIrina.id, "appeal_new", `Новое обращение ${nLate.number}`,
      "Другой учебный вопрос, учебный отдел.", nLate.createdAt, staffHref(nLate.id));

    // ---------- база ответов ----------
    await tx.insert(s.kbArticles).values(KB_ARTICLES.map((a) => ({
      topic: a.topic, question: a.question, answer: a.answer, keywords: a.keywords,
      appealTypeCode: a.appealTypeCode ?? null,
    })));
  });
}

/** Сбрасывает приложение в исходное демо-состояние; пароли берёт из env. */
export async function resetDemo(now: Date = new Date()): Promise<void> {
  const alina = process.env.DEMO_PASSWORD_ALINA;
  const denis = process.env.DEMO_PASSWORD_DENIS;
  const irina = process.env.DEMO_PASSWORD_IRINA;
  if (!alina || !denis || !irina) {
    throw new Error("Не заданы DEMO_PASSWORD_ALINA, DEMO_PASSWORD_DENIS, DEMO_PASSWORD_IRINA");
  }
  await buildDemoWorld(appDb, now, { alina, denis, irina });
}
