import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Pool } from "pg";
import * as XLSX from "xlsx";

// -----------------------------------------------------------------------------
// ENV + validation
// -----------------------------------------------------------------------------

const FORMS_SYNC_TOKEN = process.env.FORMS_SYNC_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const SERVICE_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!FORMS_SYNC_TOKEN) {
  throw new Error("FORMS_SYNC_TOKEN is missing (check .env.local)");
}
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing (check .env.local)");
}
if (!SERVICE_JSON) {
  throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing (check .env.local)");
}

// Single global pool pointed at Supabase Postgres
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type FormSourceRow = {
  code: string;
  drive_file_id: string;
  sheet_name: string | null;
  enabled: boolean;
};

// -----------------------------------------------------------------------------
// Helpers: Google Drive + XLSX
// -----------------------------------------------------------------------------

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing");

  const serviceAccount = JSON.parse(raw);
  const privateKey = (serviceAccount.private_key as string).replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}

async function downloadSheetAsBuffer(
  drive: ReturnType<typeof getDriveClient>,
  fileId: string
): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

// -----------------------------------------------------------------------------
// Core: REBUILD form_fields exactly from Excel columns
// -----------------------------------------------------------------------------

async function replaceFormFieldsForTemplate(
  templateId: string,
  code: string,
  rows: any[]
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Always start clean for this template
    await client.query(
      `DELETE FROM public.form_fields WHERE template_id = $1`,
      [templateId]
    );

    let insertedCount = 0;
    const seen = new Set<string>();

    for (const raw of rows) {
      const fieldKey = (raw.field_key || "").toString().trim();
      const label = (raw.label || "").toString().trim();
      if (!fieldKey || !label) continue;
      if (seen.has(fieldKey)) continue;
      seen.add(fieldKey);

      const helpText =
        (raw.help_text || "").toString().trim() || null;

      const section =
        (raw.section || "").toString().trim() || null;

      const audienceRaw =
        (raw.audience || "both").toString().trim().toLowerCase();
      const audience: string =
        ["lawyer", "client", "both"].includes(audienceRaw)
          ? audienceRaw
          : "both";

      const orderNum = Number(raw.order);
      const order =
        !isNaN(orderNum) && Number.isInteger(orderNum) ? orderNum : 0;

      const reqRaw = (raw.required || "")
        .toString()
        .trim()
        .toLowerCase();
      const required =
        reqRaw === "yes" ||
        reqRaw === "true" ||
        reqRaw === "1" ||
        reqRaw === "y";

      const coreKey =
        (raw.core_key || "").toString().trim() || null;

      // ---------------------------
      // input_type + type mapping
      // ---------------------------
      const inputTypeRaw = (raw.input_type || "").toString().trim();
      const inputTypeLc = inputTypeRaw.toLowerCase();
      let type = "text";

      switch (inputTypeLc) {
        case "number":
        case "currency":
          type = "number";
          break;
        case "date":
          type = "date";
          break;
        case "checkbox":
          type = "checkbox";
          break;
        case "multi_select":
          type = "multi_select";
          break;
        case "select":
        case "dropdown":
          type = "select";
          break;
        case "attachment":
        case "file_upload":
          type = "file_upload";
          break;
        default:
          type = "text";
      }

      const dataType =
        (raw.data_type || "").toString().trim() || null;

      const calcFlagRaw = (raw.is_calculated || "")
        .toString()
        .trim()
        .toLowerCase();
      const isCalculated =
        calcFlagRaw === "yes" ||
        calcFlagRaw === "true" ||
        calcFlagRaw === "1" ||
        calcFlagRaw === "y";

      const calculation =
        (raw.calculation || "").toString().trim() || null;

      const sourceNotes =
        (raw.source_notes ||
          raw["Calculation / Source Notes"] ||
          ""
        ).toString().trim() || null;

      const visibilityCondition =
        (raw.visibility_condition || "").toString().trim() || null;

      // ----- OPTIONS (as JSON array) -----
      let optionsArray: string[] | null = null;
      if (raw.options) {
        const ops = String(raw.options)
          .split(/[,;]/)
          .map((o) => o.trim())
          .filter(Boolean);
        optionsArray = ops.length > 0 ? ops : null;
      }

      // -------------------------------------------------------------------
      // validations JSON (for non-critical metadata; UI will use columns)
      // -------------------------------------------------------------------
      const validationsObj: Record<string, any> = {};

      const lineItem = (raw.line_item || "").toString().trim();
      if (lineItem) validationsObj.line_item = lineItem;

      const pattern = (raw.patern || "").toString().trim();
      if (pattern) validationsObj.pattern = pattern;

      if (dataType) validationsObj.data_type = dataType;
      if (visibilityCondition) validationsObj.visibility_condition = visibilityCondition;
      if (optionsArray) validationsObj.options = optionsArray;
      if (isCalculated) validationsObj.is_calculated = true;
      if (calculation) validationsObj.calculation = calculation;
      if (sourceNotes) validationsObj.source_notes = sourceNotes;

      // ✅ Explicit JSON serialization for jsonb columns
      const validationsJson =
        Object.keys(validationsObj).length > 0
          ? JSON.stringify(validationsObj)
          : JSON.stringify({});

      const optionsJson = optionsArray ? JSON.stringify(optionsArray) : null;

      // INSERT with all columns
      await client.query(
        `
        INSERT INTO public.form_fields (
          template_id,
          field_key,
          label,
          help_text,
          type,
          required,
          section,
          "order",
          audience,
          validations,
          core_key,
          form_code,
          data_type,
          input_type,
          is_calculated,
          calculation,
          source_notes,
          visibility_condition,
          options
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          $10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        )
      `,
        [
          templateId,
          fieldKey,
          label,
          helpText,
          type,
          required,
          section,
          order,
          audience,
          validationsJson,         // jsonb
          coreKey,
          code,
          dataType,
          inputTypeRaw || null,
          isCalculated,
          calculation,
          sourceNotes,
          visibilityCondition,
          optionsJson               // jsonb
        ]
      );

      insertedCount++;
    }

    await client.query("COMMIT");
    return insertedCount;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error replacing form fields:", err);
    throw err;
  } finally {
    client.release();
  }
}

// -----------------------------------------------------------------------------
// Route handler
// -----------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Token comparison + logging
  const rawHeader = req.headers.get("x-forms-sync-token") || "";
  const authHeader = rawHeader.trim();
  const envToken = (FORMS_SYNC_TOKEN || "").trim();

  console.log("[forms/sync] Header token:", JSON.stringify(authHeader));
  console.log("[forms/sync] Env token   :", JSON.stringify(envToken));

  if (!authHeader || !envToken || authHeader !== envToken) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized (token mismatch)" },
      { status: 401 }
    );
  }

  const drive = getDriveClient();
  const client = await pool.connect();
  const synced: any[] = [];
  const errors: any[] = [];

  try {
    // 1) Load the form_sources config
    const formSources = await client.query<FormSourceRow>(
      `SELECT code, drive_file_id, sheet_name, enabled
       FROM form_sources
       WHERE enabled = true
       ORDER BY code`
    );

    // 2) Process each enabled form template
    for (const source of formSources.rows) {
      const { code, drive_file_id, sheet_name } = source;

      try {
        // 3) Download the XLSX file
        const buffer = await downloadSheetAsBuffer(drive, drive_file_id);
        const workbook = XLSX.read(buffer, { type: "buffer" });

        const sheetNameToUse =
          sheet_name && workbook.SheetNames.includes(sheet_name)
            ? sheet_name
            : workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetNameToUse];
        if (!worksheet) {
          throw new Error(
            `Sheet "${sheetNameToUse}" not found in workbook for form ${code}`
          );
        }

        // 4) Convert sheet rows to JSON
        const rows = XLSX.utils.sheet_to_json<any>(worksheet, {
          defval: null,
        });

        // 5) Ensure form_templates entry exists
        const tmplRes = await client.query<{ id: string }>(
          `SELECT id
           FROM form_templates
           WHERE code = $1 AND version = 'v1'
           LIMIT 1`,
          [code]
        );

        let templateId: string;

        if (tmplRes.rows.length > 0) {
          templateId = tmplRes.rows[0].id;

          await client.query(
            `UPDATE form_templates
             SET updated_from_drive_at = now()
             WHERE id = $1`,
            [templateId]
          );
        } else {
          const insert = await client.query<{ id: string }>(
            `INSERT INTO form_templates (code, name, version, updated_from_drive_at)
             VALUES ($1, $2, 'v1', now())
             RETURNING id`,
            [code, `Form ${code}`]
          );
          templateId = insert.rows[0].id;
        }

        // 6) Rebuild form_fields from Sheet
        const insertedCount = await replaceFormFieldsForTemplate(
          templateId,
          code,
          rows
        );

        synced.push({
          code,
          templateId,
          rowsInserted: insertedCount,
          sheet: sheetNameToUse,
        });
      } catch (err: any) {
        console.error(`Error syncing form ${source.code}:`, err);
        errors.push({
          code: source.code,
          message: String(err?.message || err),
        });
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      synced,
      errors,
    });
  } catch (err: any) {
    console.error("Sync error:", err);
    return NextResponse.json(
      { ok: false, synced: [], errors: [{ message: "SERVER_ERROR" }] },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
