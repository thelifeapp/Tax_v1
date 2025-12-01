import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = "filing-attachments";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing Supabase env vars for attachments delete (SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const urls: string[] = Array.isArray(body.urls)
      ? body.urls
      : body.url
      ? [body.url]
      : [];

    if (urls.length === 0) {
      return NextResponse.json(
        { success: false, error: "No url(s) provided" },
        { status: 400 }
      );
    }

    const prefix = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const paths: string[] = [];

    for (const url of urls) {
      const idx = url.indexOf(prefix);
      if (idx === -1) {
        console.warn("[attachments/delete] URL does not contain expected prefix:", url);
        continue;
      }
      const path = url.slice(idx + prefix.length);
      if (path) {
        paths.push(path);
      }
    }

    if (paths.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid storage paths derived from URLs" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove(paths);

    if (error) {
      console.error("[attachments/delete] remove error", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[attachments/delete] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Delete failed" },
      { status: 500 }
    );
  }
}
