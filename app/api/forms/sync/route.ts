import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Pool } from "pg";
import * as XLSX from "xlsx";

// -----------------------------------------------------------------------------
// ENV + basic validation
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
  ssl: {
    rejectUnauthorized: false,
  },
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
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing (check .env.local)");
  }

  const serviceAccount = JSON.parse(raw);

  // 🔑 Normalize the private key newlines
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

  const data = res.data as unknown as ArrayBuffer;
  return Buffer.from(data);
}

// Replace form_fields for a template_id with new rows
async function replaceFormFieldsForTemplate(
  templateId: string,
  code: string,
  rows: any[]
) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Clear existing fields
    await client.query(
      `delete from public.form_fields where template_id = $1`,
      [templateId]
    );

    for (const raw of rows) {
      // ----- REQUIRED FIELDS -----
      const fieldKey = (raw.field_key || "").toString().trim();
      const label = (raw.label || "").toString().trim();

      if (!fieldKey || !label) continue; // skip blank rows

      // ----- BASIC FIELDS -----
      const helpText = (raw.help_text || "").toString().trim() || null;
      const section = (raw.section || "").toString().trim() || null;
      const audience = (raw.audience || "both").toString().trim() || "both";

      // ORDER
      const orderNum = Number(raw.order);
      const order = isNaN(orderNum) ? 0 : orderNum;

      // REQUIRED
      const requiredRaw = (raw.required || "").toString().trim().toLowerCase();
      const isRequired =
        requiredRaw === "yes" ||
        requiredRaw === "true" ||
        requiredRaw === "y" ||
        requiredRaw === "1";

      // CORE KEY
      const coreKey =
        (raw.core_key || "").toString().trim() || null;

      // ----- INPUT TYPE -----
      const inputRaw = (raw.input_type || "").toString().trim().toLowerCase();
      let type = "text";

      switch (inputRaw) {
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
          type = "select";
          break;
        case "attachment":
        case "file_upload":
          type = "file_upload";
          break;
        default:
          type = "text";
      }

      // ----- BUILD VALIDATIONS JSON -----
      const validations: any = {};

      // LINE ITEM
      const lineItem = (raw.line_item || "").toString().trim();
      if (lineItem) validations.line_item = lineItem;

      // DATA TYPE
      const dataType = (raw.data_type || "").toString().trim();
      if (dataType) validations.data_type = dataType;

      // PATTERN
      const pattern = (raw.patern || "").toString().trim();
      if (pattern) validations.pattern = pattern;

      // OPTIONS
      const optionsRaw = (raw.options || "").toString().trim();
      if (optionsRaw) {
        const opts = optionsRaw
          .split(";")
          .map((o: string) => o.trim())
          .filter(Boolean);
        if (opts.length > 0) validations.options = opts;
      }

      // VISIBILITY CONDITION
      const vis = (raw.visibility_condition || "").toString().trim();
      if (vis) validations.visibility_condition = vis;

      // IS CALCULATED
      const calcFlag = (raw.is_calculated || "")
        .toString()
        .trim()
        .toLowerCase();
      const isCalculated =
        calcFlag === "yes" ||
        calcFlag === "y" ||
        calcFlag === "true" ||
        calcFlag === "1";

      if (isCalculated) validations.is_calculated = true;

      // CALCULATION
      const calcExpr = (raw.calculation || "").toString().trim();
      if (calcExpr) validations.calculation = calcExpr;

      // --- Insert form_fields row ---
      await client.query(
        `
        insert into public.form_fields (
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
          form_code
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `,
        [
          templateId,
          fieldKey,
          label,
          helpText,
          type,
          isRequired,
          section,
          order,
          audience,
          validations,
          coreKey,
          code,
        ]
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
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
  const authHeader = req.headers.get("x-forms-sync-token");
  if (!authHeader || authHeader !== FORMS_SYNC_TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  const drive = getDriveClient();

  const synced: Array<{
    code: string;
    templateId: string;
    rowsInserted: number;
    sheet: string;
  }> = [];
  const errors: any[] = [];

  try {
    // 1) Load form_sources
    const formSourcesResult = await client.query<FormSourceRow>(
      `select code, drive_file_id, sheet_name, enabled
       from form_sources
       where enabled = true
       order by code`
    );

    const sources = formSourcesResult.rows;

    for (const source of sources) {
      const { code, drive_file_id, sheet_name } = source;

      try {
        // 2) Download XLSX from Drive
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

        const rows = XLSX.utils.sheet_to_json<any>(worksheet, {
          defval: null,
        });

        // 3) Ensure form_templates row exists (code + v1)
        const existingTemplate = await client.query<{
          id: string;
        }>(
          `select id
           from form_templates
           where code = $1 and version = 'v1'
           limit 1`,
          [code]
        );

        let templateId: string;

        if (existingTemplate.rows.length > 0) {
          templateId = existingTemplate.rows[0].id;
          await client.query(
            `update form_templates
             set updated_from_drive_at = now()
             where id = $1`,
            [templateId]
          );
        } else {
          const insertTemplate = await client.query<{
            id: string;
          }>(
            `insert into form_templates (code, name, version, updated_from_drive_at)
             values ($1, $2, 'v1', now())
             returning id`,
            [code, `Form ${code}`]
          );
          templateId = insertTemplate.rows[0].id;
        }

        // 4) Rebuild form_fields for this template
        await replaceFormFieldsForTemplate(templateId, code, rows);

        synced.push({
          code,
          templateId,
          rowsInserted: rows.length,
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
