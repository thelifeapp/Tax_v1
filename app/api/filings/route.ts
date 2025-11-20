// app/api/filings/route.ts

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// --- Supabase admin client (service role) -----------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// These logs will show up in your terminal when the route file is loaded
console.log("[/api/filings] SUPABASE URL defined:", !!supabaseUrl);
console.log(
  "[/api/filings] SERVICE ROLE KEY defined:",
  !!serviceKey
);

const supabaseAdmin =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
      })
    : null;

// --- Route handler ----------------------------------------------------

export async function POST(req: NextRequest) {
  console.log("[/api/filings] POST hit");

  if (!supabaseAdmin) {
    console.error(
      "[/api/filings] ERROR: supabaseAdmin not initialized (check env vars)"
    );
    return NextResponse.json(
      {
        error:
          "Server misconfigured: Supabase admin client not initialized. Check SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.",
      },
      { status: 500 }
    );
  }

  let body: {
    clientId?: string;
    forms?: string[];
    taxYear?: number;
    status?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { clientId, forms, taxYear, status } = body;

  if (!clientId || !forms || forms.length === 0 || !taxYear) {
    return NextResponse.json(
      { error: "clientId, forms, and taxYear are required" },
      { status: 400 }
    );
  }

  const rows = forms.map((code) => ({
    client_id: clientId,
    filing_type: code,          // "1041" | "706" | "709"
    tax_year: taxYear,
    status: status ?? "draft",  // filing_status enum
  }));

  const { data, error } = await supabaseAdmin
    .from("filings")
    .insert(rows)
    .select("*");

  if (error) {
    console.error("Supabase filings insert error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
