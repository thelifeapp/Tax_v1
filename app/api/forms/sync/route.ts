// app/api/forms/sync/route.ts
import { NextResponse, NextRequest } from "next/server";

export const runtime = "nodejs"; // ensure server runtime

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-forms-sync-token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
  return NextResponse.json({ ok: true, ping: "sync route alive" });
}

export async function GET() {
  // helpful for quick checks in the browser
  return NextResponse.json({ ok: true, route: "/api/forms/sync" });
}
