import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlStartsWith: process.env.DATABASE_URL?.slice(0, 30) || null,
  });
}
