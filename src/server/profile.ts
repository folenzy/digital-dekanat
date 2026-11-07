import { eq } from "drizzle-orm";
import type { StudentViewer } from "./auth/viewer";
import { db } from "./db/client";
import { faculties, groups, programs, students } from "./db/schema";

export type Profile = {
  lastName: string; firstName: string; middleName: string | null; fullName: string; initials: string;
  faculty: { code: string; name: string };
  program: { code: string; name: string; profile: string | null };
  course: number; group: string; studyForm: string; funding: string;
  recordBookNo: string; email: string | null; curatorName: string | null;
};

export async function getProfile(v: StudentViewer): Promise<Profile> {
  const [r] = await db
    .select({
      lastName: students.lastName, firstName: students.firstName, middleName: students.middleName,
      studyForm: students.studyForm, funding: students.funding, recordBookNo: students.recordBookNo,
      email: students.email, curatorName: students.curatorName,
      facultyCode: faculties.code, facultyName: faculties.name,
      programCode: programs.code, programName: programs.name, programProfile: programs.profile,
      course: groups.course, group: groups.name,
    })
    .from(students)
    .innerJoin(groups, eq(groups.id, students.groupId))
    .innerJoin(faculties, eq(faculties.id, groups.facultyId))
    .innerJoin(programs, eq(programs.id, groups.programId))
    .where(eq(students.id, v.studentId))
    .limit(1);
  if (!r) throw new Error("Профиль студента не найден");
  return {
    lastName: r.lastName, firstName: r.firstName, middleName: r.middleName,
    fullName: [r.lastName, r.firstName, r.middleName].filter(Boolean).join(" "),
    initials: (r.firstName[0] + r.lastName[0]).toUpperCase(),
    faculty: { code: r.facultyCode, name: r.facultyName },
    program: { code: r.programCode, name: r.programName, profile: r.programProfile },
    course: r.course, group: r.group, studyForm: r.studyForm, funding: r.funding,
    recordBookNo: r.recordBookNo, email: r.email, curatorName: r.curatorName,
  };
}
