import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import { createAppeal, postStudentMessage } from "@/server/appeals/service";
import { replyAppeal, takeAppeal } from "@/server/appeals/staff";
import { LIVE_CHANNEL, publish, type LivePayload } from "@/server/realtime";
import { closeTestDb, testSql } from "../helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const NOW = new Date("2026-11-10T09:00:00Z");

let alina: StudentViewer;
let denis: StudentViewer;
let irina: StaffViewer;
let received: LivePayload[] = [];
let unlisten: () => Promise<void>;

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id))!;
}

/** Ждёт контрольное событие: всё, что опубликовано до него, уже пришло (NOTIFY доставляется в порядке коммитов). */
async function drain(): Promise<LivePayload[]> {
  const marker = `marker-${Math.random()}`;
  await publish([marker], { type: "notification" });
  await vi.waitFor(() => expect(received.some((p) => p.userIds[0] === marker)).toBe(true));
  return received.filter((p) => p.userIds[0] !== marker);
}

beforeAll(async () => {
  await buildDemoWorld(db, NOW, pw);
  alina = (await viewerOf("alina.mironova")) as StudentViewer;
  denis = (await viewerOf("denis.kravtsov")) as StudentViewer;
  irina = (await viewerOf("irina.belova")) as StaffViewer;
  ({ unlisten } = await testSql.listen(LIVE_CHANNEL, (p) => received.push(JSON.parse(p))));
});
beforeEach(() => { received = []; });
afterAll(async () => {
  await unlisten();
  await closeTestDb();
});

describe("publish", () => {
  it("один pg_notify с адресатами и событием", async () => {
    await publish([alina.userId], { type: "notification", title: "Привет", href: "/", appealId: "x" });
    expect(await drain()).toEqual([
      { userIds: [alina.userId], event: { type: "notification", title: "Привет", href: "/", appealId: "x" } },
    ]);
  });

  it("без адресатов ничего не шлёт; слишком большое событие — ошибка", async () => {
    await publish([], { type: "notification", title: "никому" });
    await expect(publish([alina.userId], { type: "notification", title: "я".repeat(5000) })).rejects.toThrow();
    expect(await drain()).toEqual([]);
  });
});

describe("события обращений", () => {
  it("createAppeal → событие сотрудникам отдела со ссылкой на карточку сотрудника", async () => {
    const r = await createAppeal(alina, "cert_military", { destination: "Военкомат", copies: 1, format: "paper" }, NOW);
    if (!r.ok) throw new Error("ожидался успех");
    expect(await drain()).toEqual([{
      userIds: [irina.userId],
      event: {
        type: "notification", title: `Новое обращение ${r.value.number}`,
        href: `/staff/appeals/${r.value.id}`, appealId: r.value.id,
      },
    }]);
  });

  it("replyAppeal по обращению Дениса публикует событие только Денису", async () => {
    const [a] = await db.select().from(s.appeals)
      .where(and(eq(s.appeals.studentId, denis.studentId), eq(s.appeals.typeCode, "study_retake")));
    expect((await replyAppeal(irina, a.id, "Дата подходит?", NOW)).ok).toBe(true);
    expect(await drain()).toEqual([{
      userIds: [denis.userId],
      event: {
        type: "notification", title: `Деканат ответил по обращению ${a.number}`,
        href: `/dekanat/${a.id}`, appealId: a.id,
      },
    }]);
  });

  it("неудачное действие ничего не публикует", async () => {
    const [a] = await db.select().from(s.appeals)
      .where(and(eq(s.appeals.studentId, denis.studentId), eq(s.appeals.typeCode, "study_retake")));
    expect((await takeAppeal(irina, a.id, NOW)).ok).toBe(false);
    expect((await postStudentMessage(alina, a.id, "чужое", NOW)).ok).toBe(false);
    expect(await drain()).toEqual([]);
  });
});
