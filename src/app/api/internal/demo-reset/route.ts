import { timingSafeEqual } from "node:crypto";
import { resetDemo } from "@/server/demo/world";

export const dynamic = "force-dynamic";

function tokenMatches(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
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
