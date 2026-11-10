import type { NextRequest } from "next/server";
import { HEARTBEAT_MS, openEventStream } from "@/server/events-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  return openEventStream(req, HEARTBEAT_MS);
}
