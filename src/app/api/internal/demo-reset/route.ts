import { createHash, timingSafeEqual } from "node:crypto";
import { resetDemo } from "@/server/demo/world";

export const dynamic = "force-dynamic";

const digest = (s: string) => createHash("sha256").update(s).digest();

// Сравниваем sha-256 дайджесты: длины всегда равны, время не зависит от длины токена.
function tokenMatches(expected: string, given: string | null): boolean {
  return timingSafeEqual(digest(expected), digest(given ?? ""));
}

// Ручной и ночной сброс демо-мира. Без верного токена маршрут «не существует».
export async function POST(req: Request): Promise<Response> {
  const expected = process.env.DEMO_RESET_TOKEN;
  if (!expected || !tokenMatches(expected, req.headers.get("x-reset-token"))) {
    return new Response("Not Found", { status: 404 });
  }
  await resetDemo();
  return Response.json({ ok: true });
}
