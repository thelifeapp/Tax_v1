// app/api/intake/answer/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Autosave a single answer for a filing.
 *
 * Expected JSON body:
 * {
 *   filingId: string;
 *   formCode: string;
 *   fieldKey: string;
 *   value: any;
 *   mode: "client" | "lawyer";
 * }
 */
export async function POST(req: NextRequest) {
  let body: {
    filingId?: string;
    formCode?: string;
    fieldKey?: string;
    value?: any;
    mode?: "client" | "lawyer";
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { filingId, fieldKey, value, mode } = body;

  if (!filingId || !fieldKey) {
    return NextResponse.json(
      { error: "filingId and fieldKey are required" },
      { status: 400 }
    );
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from("form_answers")
    .upsert(
      {
        filing_id: filingId,
        field_key: fieldKey,
        value: value,
        source: mode ?? "lawyer", // matches your answer_source enum
      },
      {
        onConflict: "filing_id,field_key",
      }
    )
    .select("*")
    .single();

  if (error) {
    console.error("[/api/intake/answer] Supabase upsert error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true, answer: data },
    { status: 200 }
  );
}
