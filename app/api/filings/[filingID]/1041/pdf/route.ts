export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { Pool } from "pg";
import { PDFDocument } from "pdf-lib";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing (check .env.local)");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function jsonToPrimitive(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(jsonToPrimitive);
  if (typeof v === "object") {
    if ("value" in v) return jsonToPrimitive((v as any).value);
    if ("text" in v) return jsonToPrimitive((v as any).text);
    return v;
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

function normalizeToken(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[—–-]/g, "_")
    .replace(/&/g, "and")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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
  ctx: { params: Promise<{ filingID: string }> }
) {
  const client = await pool.connect();

  try {
    const { filingID } = await ctx.params;

    const { searchParams } = new URL(req.url);
    const dump = searchParams.get("dump") === "1";
    const inline = searchParams.get("inline") === "1";

    // 1) Load filing (validate exists + is 1041)
    const filingRes = await client.query(
      `
      SELECT id, client_id, filing_type, tax_year
      FROM public.filings
      WHERE id = $1
      LIMIT 1
      `,
      [filingID]
    );

    const filing = filingRes.rows[0] ?? null;

    if (!filing) {
      return NextResponse.json(
        { error: `Filing not found: ${filingID}` },
        { status: 404 }
      );
    }

    if (String(filing.filing_type) !== "1041") {
      return NextResponse.json(
        { error: `This endpoint only supports 1041. Got: ${filing.filing_type}` },
        { status: 400 }
      );
    }

    // 2) Pull answers
    const answersRes = await client.query(
      `
      SELECT field_key, value
      FROM public.form_answers
      WHERE filing_id = $1
      `,
      [filingID]
    );

    const answerMap = new Map<string, any>();
    for (const row of answersRes.rows) {
      answerMap.set(row.field_key, row.value);
    }

    // 3) Pull checkbox mappings
    const mapsRes = await client.query(
      `
      SELECT field_key, pdf_field_name, format, constant_value
      FROM public.pdf_field_mappings_1041
      WHERE tax_year = 2024
      `,
      []
    );

    const pdfMaps: PdfMapRow[] = mapsRes.rows ?? [];
    const checkboxMaps = pdfMaps.filter(
      (r) => String(r.format ?? "").toLowerCase() === "checkbox"
    );

    // 4) Load PDF template
    const pdfPath = path.join(process.cwd(), "public", "forms", "1041_2024_fillable.pdf");
    const pdfBytes = await fs.readFile(pdfPath);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    // Debug mode: list PDF fields
    if (dump) {
      const names = form.getFields().map((f) => f.getName());
      return NextResponse.json({
        pdfPath,
        filingID,
        taxYear: filing.tax_year,
        pdfFieldCount: names.length,
        pdfFieldNamesSample: names.slice(0, 250),
        checkboxMappingRows: checkboxMaps.length,
      });
    }

    // 5) Fill text fields (where field_key == pdf field name)
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

    // 6) Fill checkboxes via mapping table
    let filledCheckbox = 0;
    const missingCheckboxInPdf: string[] = [];

    for (const m of checkboxMaps) {
      const logicalAnswer = jsonToPrimitive(answerMap.get(m.field_key));
      const option = m.constant_value ?? "";

      let shouldCheck = false;

      if (Array.isArray(logicalAnswer)) {
        shouldCheck = logicalAnswer.some((item) => matchesOption(item, option));
      } else if (typeof logicalAnswer === "boolean") {
        if (!option) shouldCheck = logicalAnswer === true;
        else shouldCheck = matchesOption(String(logicalAnswer), option);
      } else {
        if (!option) shouldCheck = isTruthyYes(logicalAnswer);
        else shouldCheck = matchesOption(logicalAnswer, option);
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

    const outBytes = await pdfDoc.save();

    const disposition = inline
      ? `inline; filename="1041_${filing.tax_year}_${filingID}.pdf"`
      : `attachment; filename="1041_${filing.tax_year}_${filingID}.pdf"`;

    return new NextResponse(outBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
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
  } finally {
    client.release();
  }
}
