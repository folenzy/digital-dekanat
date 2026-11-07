import { sql } from "drizzle-orm";
import {
  boolean, check, customType, date, index, integer, jsonb, pgEnum, pgSequence, pgTable,
  primaryKey, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

// ---------- enums ----------
export const roleEnum = pgEnum("role", ["student", "staff"]);
export const appealStatusEnum = pgEnum("appeal_status", [
  "submitted", "in_progress", "needs_info", "ready", "rejected", "closed",
]);
export const appealKindEnum = pgEnum("appeal_kind", ["certificate", "application", "question"]);
export const lessonTypeEnum = pgEnum("lesson_type", ["lecture", "practice", "lab"]);
export const changeKindEnum = pgEnum("change_kind", ["moved", "cancelled", "teacher", "room", "extra"]);
export const controlFormEnum = pgEnum("control_form", ["exam", "credit", "graded_credit"]);
export const weekParityEnum = pgEnum("week_parity", ["odd", "even", "both"]);

export const appealNumberSeq = pgSequence("appeal_number_seq");

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tstz("created_at").notNull().defaultNow();

// tsvector для полнотекстового поиска (значение вычисляет сама БД)
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

// ---------- auth ----------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  login: text("login").unique(),
  passwordHash: text("password_hash"),
  role: roleEnum("role").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: tstz("expires_at").notNull(),
  createdAt: createdAt(),
  lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
  userAgent: text("user_agent"),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const loginAttempts = pgTable("login_attempts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull(),
  success: boolean("success").notNull(),
  createdAt: createdAt(),
}, (t) => [index("login_attempts_key_idx").on(t.key), index("login_attempts_created_idx").on(t.createdAt)]);

export const actionLog = pgTable("action_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  createdAt: createdAt(),
}, (t) => [index("action_log_user_action_idx").on(t.userId, t.action, t.createdAt)]);

// ---------- структура вуза ----------
export const faculties = pgTable("faculties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull(),
  name: text("name").notNull(),
});

export const programs = pgTable("programs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  facultyId: integer("faculty_id").notNull().references(() => faculties.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  profile: text("profile"),
});

export const groups = pgTable("groups", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  facultyId: integer("faculty_id").notNull().references(() => faculties.id),
  programId: integer("program_id").notNull().references(() => programs.id),
  course: integer("course").notNull(),
  name: text("name").notNull().unique(),
});

export const students = pgTable("students", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  groupId: integer("group_id").notNull().references(() => groups.id),
  studyForm: text("study_form").notNull(),
  funding: text("funding").notNull(),
  recordBookNo: text("record_book_no").notNull().unique(),
  email: text("email"),
  curatorName: text("curator_name"),
}, (t) => [index("students_group_idx").on(t.groupId)]);

export const departments = pgTable("departments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(), // 'docs' | 'study' | 'stipend'
  name: text("name").notNull(),
});

export const staff = pgTable("staff", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  position: text("position").notNull(),
});

export const staffDepartments = pgTable("staff_departments", {
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  departmentId: integer("department_id").notNull().references(() => departments.id),
}, (t) => [primaryKey({ columns: [t.staffId, t.departmentId] })]);

// ---------- расписание ----------
export const teachers = pgTable("teachers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fullName: text("full_name").notNull(),
});

export const disciplines = pgTable("disciplines", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
});

export const rooms = pgTable("rooms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  building: text("building"),
});

export const scheduleSlots = pgTable("schedule_slots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  weekday: integer("weekday").notNull(),
  parity: weekParityEnum("parity").notNull().default("both"),
  pair: integer("pair").notNull(),
  disciplineId: integer("discipline_id").notNull().references(() => disciplines.id),
  lessonType: lessonTypeEnum("lesson_type").notNull(),
  roomId: integer("room_id").notNull().references(() => rooms.id),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id),
}, (t) => [
  index("schedule_slots_group_idx").on(t.groupId, t.weekday),
  check("schedule_slots_weekday_chk", sql`${t.weekday} between 1 and 7`),
  check("schedule_slots_pair_chk", sql`${t.pair} between 1 and 6`),
]);

export const scheduleChanges = pgTable("schedule_changes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  date: date("date", { mode: "string" }).notNull(),
  pair: integer("pair").notNull(),
  kind: changeKindEnum("kind").notNull(),
  newPair: integer("new_pair"),
  newRoomId: integer("new_room_id").references(() => rooms.id),
  newTeacherId: integer("new_teacher_id").references(() => teachers.id),
  disciplineId: integer("discipline_id").references(() => disciplines.id), // для 'extra'
  lessonType: lessonTypeEnum("lesson_type"),
  note: text("note"),
}, (t) => [index("schedule_changes_group_date_idx").on(t.groupId, t.date)]);

// ---------- успеваемость ----------
export const enrollments = pgTable("enrollments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  disciplineId: integer("discipline_id").notNull().references(() => disciplines.id),
  semester: integer("semester").notNull(),
  controlForm: controlFormEnum("control_form").notNull(),
  points: integer("points"),
  finalGrade: text("final_grade"), // '5','4','3','2','зачёт','незачёт'
  admitted: boolean("admitted"),
}, (t) => [
  index("enrollments_student_idx").on(t.studentId),
  check("enrollments_semester_chk", sql`${t.semester} between 1 and 8`),
  check("enrollments_points_chk", sql`${t.points} is null or ${t.points} between 0 and 100`),
  check("enrollments_grade_chk", sql`${t.finalGrade} is null or ${t.finalGrade} in ('5','4','3','2','зачёт','незачёт')`),
]);

export const checkpoints = pgTable("checkpoints", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  maxPoints: integer("max_points").notNull(),
  score: integer("score"),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  required: boolean("required").notNull().default(false),
}, (t) => [index("checkpoints_enrollment_idx").on(t.enrollmentId)]);

export const exams = pgTable("exams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  disciplineId: integer("discipline_id").notNull().references(() => disciplines.id),
  kind: text("kind").notNull(), // 'exam' | 'credit' | 'retake'
  startsAt: tstz("starts_at").notNull(),
  roomId: integer("room_id").notNull().references(() => rooms.id),
  studentId: integer("student_id").references(() => students.id, { onDelete: "cascade" }), // только индивидуальная пересдача
}, (t) => [
  index("exams_group_idx").on(t.groupId, t.startsAt),
  check("exams_kind_chk", sql`${t.kind} in ('exam','credit','retake')`),
]);

// ---------- обращения ----------
export const appealTypes = pgTable("appeal_types", {
  code: text("code").primaryKey(),
  topic: text("topic").notNull(),
  kind: appealKindEnum("kind").notNull(),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  title: text("title").notNull(),
  hint: text("hint"),
  slaDays: integer("sla_days").notNull(),
});

export const deadlines = pgTable("deadlines", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  startsAt: tstz("starts_at").notNull(),
  endsAt: tstz("ends_at").notNull(),
  audienceFacultyId: integer("audience_faculty_id").references(() => faculties.id),
  audienceCourse: integer("audience_course"),
  audienceGroupId: integer("audience_group_id").references(() => groups.id),
  appealTypeCode: text("appeal_type_code").references(() => appealTypes.code),
});

export const appeals = pgTable("appeals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  number: text("number").notNull().unique()
    .default(sql`'О-2026-' || lpad(nextval('appeal_number_seq')::text, 6, '0')`),
  studentId: integer("student_id").notNull().references(() => students.id),
  typeCode: text("type_code").notNull().references(() => appealTypes.code),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  assigneeStaffId: integer("assignee_staff_id").references(() => staff.id),
  status: appealStatusEnum("status").notNull().default("submitted"),
  fields: jsonb("fields").notNull().default(sql`'{}'::jsonb`),
  slaDueAt: tstz("sla_due_at").notNull(),
  firstResponseAt: tstz("first_response_at"),
  pickupPlace: text("pickup_place"),
  pickupUntil: tstz("pickup_until"),
  rejectReason: text("reject_reason"),
  createdAt: createdAt(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
  closedAt: tstz("closed_at"),
}, (t) => [
  index("appeals_student_idx").on(t.studentId),
  index("appeals_dept_status_sla_idx").on(t.departmentId, t.status, t.slaDueAt),
]);

export const appealEvents = pgTable("appeal_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  appealId: uuid("appeal_id").notNull().references(() => appeals.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  kind: text("kind").notNull(),
  text: text("text"),
  createdAt: createdAt(),
}, (t) => [index("appeal_events_appeal_idx").on(t.appealId)]);

export const appealMessages = pgTable("appeal_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  appealId: uuid("appeal_id").notNull().references(() => appeals.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
}, (t) => [index("appeal_messages_appeal_idx").on(t.appealId)]);

// ---------- уведомления и объявления ----------
export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  createdAt: createdAt(),
  readAt: tstz("read_at"),
}, (t) => [index("notifications_user_read_idx").on(t.userId, t.readAt)]);

export const announcements = pgTable("announcements", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  authorStaffId: integer("author_staff_id").notNull().references(() => staff.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audienceFacultyId: integer("audience_faculty_id").references(() => faculties.id),
  audienceCourse: integer("audience_course"),
  audienceGroupId: integer("audience_group_id").references(() => groups.id),
  important: boolean("important").notNull().default(false),
  publishedAt: tstz("published_at").notNull().defaultNow(),
});

// ---------- база знаний ----------
export const kbArticles = pgTable("kb_articles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  topic: text("topic").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  keywords: text("keywords").notNull().default(""),
  appealTypeCode: text("appeal_type_code").references(() => appealTypes.code),
  search: tsvector("search").generatedAlwaysAs(
    sql`to_tsvector('russian', question || ' ' || keywords || ' ' || answer)`,
  ),
}, (t) => [index("kb_articles_search_idx").using("gin", t.search)]);
