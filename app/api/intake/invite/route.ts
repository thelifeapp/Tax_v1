// app/api/intake/invite/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  let body: { filingId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { filingId, email } = body;

  if (!filingId) {
    return NextResponse.json(
      { error: "filingId is required" },
      { status: 400 }
    );
  }

  // Generate token + expiration (30 days)
  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const { data, error } = await supabase
    .from("client_invites")
    .insert({
      filing_id: filingId,
      email: email ?? null,
      token,
      expires_at: expiresAt.toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating client invite:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  // Build link to /intake/{token}
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const link = `${baseUrl}/intake/${token}`;

  return NextResponse.json(
    {
      id: data.id,
      link,
      token,
    },
    { status: 201 }
  );
}
