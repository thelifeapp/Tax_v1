// app/api/filings/[filingID]/1041/pdf/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

function jsonToPrimitive(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(jsonToPrimitive);
  if (typeof v === "object") {
    if ("value" in v) return jsonToPrimitive((v as any).value);
    if ("text" in v) return jsonToPrimitive((v as any).text);
    return v; // keep object (we'll stringify for text fields)
  }
  return v;
}

function jsonToString(v: any): string {
  const p = jsonToPrimitive(v);
  if (p === null || p === undefined) return "";
  if (typeof p === "string") return p;
  if (typeof p === "number") return String(p);
  if (typeof p === "boolean") return p ? "Yes" : "No";
  return JSON.stringify(p);
}

function isTruthyYes(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "on" || s === "checked";
}

/**
 * Option 2: normalization safety net
 * - Handles curly apostrophes (Decedent’s vs Decedent's)
 * - Handles em/en dashes (Ch. 7 vs Ch—7)
 * - Handles punctuation / spacing differences
 * - Allows mapping table to use either UI labels or tokens
 */
function normalizeToken(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "") // remove apostrophes (curly + straight)
    .replace(/[—–-]/g, "_") // dashes/em-dashes -> underscore
    .replace(/&/g, "and")
    .replace(/\./g, "") // remove periods (e.g. "Ch. 7" -> "ch 7")
    .replace(/[^a-z0-9]+/g, "_") // spaces/punct -> underscore
    .replace(/^_+|_+$/g, ""); // trim underscores
}

/**
 * Flexible match:
 * - exact match wins
 * - otherwise normalized match
 */
function matchesOption(answerItem: any, option: string): boolean {
  const a = String(answerItem ?? "");
  const o = String(option ?? "");
  if (a === o) return true;
  return normalizeToken(a) === normalizeToken(o);
}

type PdfMapRow = {
  field_key: string;
  pdf_field_name: string;
  format: string | null;
  constant_value: string | null;
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ filingID: string }> } // Next.js 16: params is a Promise
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server misconfigured: Supabase admin client not initialized." },
        { status: 500 }
      );
    }

    const { filingID } = await ctx.params;

    const { searchParams } = new URL(req.url);
    const dump = searchParams.get("dump") === "1";

    // 1) Validate filing exists + is 1041
    const { data: filing, error: filingErr } = await supabaseAdmin
      .from("filings")
      .select("id, client_id, filing_type, tax_year")
      .eq("id", filingID)
      .single();

    if (filingErr || !filing) {
      return NextResponse.json(
        { error: `Filing not found: ${filingID}`, details: filingErr?.message },
        { status: 404 }
      );
    }

    if (String(filing.filing_type) !== "1041") {
      return NextResponse.json(
        { error: `This endpoint only supports 1041. Got: ${filing.filing_type}` },
        { status: 400 }
      );
    }

    // 2) Pull answers (UI source of truth)
    const { data: answers, error: ansErr } = await supabaseAdmin
      .from("form_answers")
      .select("field_key, value")
      .eq("filing_id", filingID);

    if (ansErr) return NextResponse.json({ error: ansErr.message }, { status: 500 });

    const answerMap = new Map<string, any>();
    (answers ?? []).forEach((a: any) => answerMap.set(a.field_key, a.value));

    // 3) Pull checkbox mappings (translation layer)
    const { data: pdfMaps, error: mapErr } = await supabaseAdmin
      .from("pdf_field_mappings_1041")
      .select("field_key, pdf_field_name, format, constant_value")
      .eq("tax_year", 2024);

    if (mapErr) return NextResponse.json({ error: mapErr.message }, { status: 500 });

    const checkboxMaps = (pdfMaps ?? []).filter(
      (r: PdfMapRow) => (r.format ?? "").toLowerCase() === "checkbox"
    );

    // 4) Load PDF template
    const pdfPath = path.join(process.cwd(), "public", "forms", "1041_2024_fillable.pdf");
    const pdfBytes = await fs.readFile(pdfPath);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    // Dump mode: confirm PDF field names
    if (dump) {
      const names = form.getFields().map((f) => f.getName());
      return NextResponse.json({
        pdfPath,
        filingID,
        taxYear: filing.tax_year,
        pdfFieldCount: names.length,
        pdfFieldNamesSample: names.slice(0, 250),
        hasEstateOrTrustName: names.includes("estate_or_trust_name"),
        hasEin: names.includes("employer_identification_number_ein"),
        checkboxMappingRows: checkboxMaps.length,
      });
    }

    // 5) Fill text fields where field_key == pdf field name (your page-1 renames)
    let filledText = 0;
    const missingTextInPdf: string[] = [];

    for (const [fieldKey, rawVal] of answerMap.entries()) {
      const valueStr = jsonToString(rawVal);

      try {
        form.getTextField(fieldKey).setText(valueStr);
        filledText++;
      } catch {
        const coveredByCheckboxMap = checkboxMaps.some((m) => m.field_key === fieldKey);
        if (!coveredByCheckboxMap) missingTextInPdf.push(fieldKey);
      }
    }

    // 6) Fill checkboxes via mapping table (now with normalization fallback)
    let filledCheckbox = 0;
    const missingCheckboxInPdf: string[] = [];

    for (const m of checkboxMaps) {
      const logicalAnswer = jsonToPrimitive(answerMap.get(m.field_key));
      const option = m.constant_value ?? "";

      let shouldCheck = false;

      if (Array.isArray(logicalAnswer)) {
        // Multi-select: check if ANY selected item matches this mapping option
        shouldCheck = logicalAnswer.some((item) => matchesOption(item, option));
      } else if (typeof logicalAnswer === "boolean") {
        // boolean support
        if (!option) {
          shouldCheck = logicalAnswer === true;
        } else {
          shouldCheck = matchesOption(String(logicalAnswer), option);
        }
      } else {
        // string/number/etc.
        if (!option) {
          // yes/no checkbox
          shouldCheck = isTruthyYes(logicalAnswer);
        } else {
          shouldCheck = matchesOption(logicalAnswer, option);
        }
      }

      try {
        const cb = form.getCheckBox(m.pdf_field_name);
        if (shouldCheck) cb.check();
        else cb.uncheck();
        filledCheckbox++;
      } catch {
        missingCheckboxInPdf.push(m.pdf_field_name);
      }
    }

    const outBytes = await pdfDoc.save(); // keep fillable

    return new NextResponse(outBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="1041_${filing.tax_year}_${filingID}.pdf"`,
        "X-Filled-Text": String(filledText),
        "X-Filled-Checkbox": String(filledCheckbox),
        "X-Missing-Text-In-PDF-Count": String(missingTextInPdf.length),
        "X-Missing-Checkbox-In-PDF-Count": String(missingCheckboxInPdf.length),
        "X-Missing-Checkbox-In-PDF-Sample": missingCheckboxInPdf.slice(0, 25).join(","),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Unhandled error in 1041 PDF route", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
