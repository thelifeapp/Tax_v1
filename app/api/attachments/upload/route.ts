import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = "filing-attachments";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing Supabase env vars for attachments (SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const filingId = formData.get("filingId");
    const fieldKey = formData.get("fieldKey");
    const files = formData.getAll("files") as File[];

    if (!filingId || !fieldKey || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing filingId, fieldKey, or files" },
        { status: 400 }
      );
    }

    const urls: string[] = [];

    for (const file of files) {
      const safeName = file.name.replace(/\s+/g, "-");
      const path = `${filingId}/${fieldKey}/${Date.now()}-${safeName}`;

      const { error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(path, file, {
          upsert: false,
        });

      if (error) {
        console.error("[attachments/upload] upload error", error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      const { data } = supabaseAdmin.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      urls.push(data.publicUrl);
    }

    return NextResponse.json({ success: true, urls });
  } catch (err: any) {
    console.error("[attachments/upload] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
