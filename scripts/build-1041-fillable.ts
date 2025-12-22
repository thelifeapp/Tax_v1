//
// Generate a fillable 1041 PDF using pdf-lib.
// - Uses the IRS PDF as a background (public/forms/1041_2024_source.pdf)
// - Creates AcroForm fields whose NAMES match your `field_key`s
// - Checkbox groups become: `${field_key}__${option_slug}`
// - Places fields in a "parking lot" so you can drag them onto the form in Acrobat
//

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";

type FieldRow = {
  field_key: string;
  input_type?: string | null;
  data_type?: string | null;
  options?: string | null;
};

function slugifyOption(v: string) {
  return v
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseOptions(raw: any): string[] {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  // supports "a; b; c" or newline-separated
  return s
    .split(/[\n;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function main() {
  const projectRoot = process.cwd();

  // ---- Inputs / outputs ----
  const sourcePath = path.join(projectRoot, "public", "forms", "1041_2024_source.pdf");
  const outPath = path.join(projectRoot, "public", "forms", "1041_2024_fillable.pdf");
  const fieldMapPath = path.join(projectRoot, "scripts", "IRS_Form_1041_Field_Map.xlsx");

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source PDF at: ${sourcePath}`);
  }
  if (!fs.existsSync(fieldMapPath)) {
    throw new Error(
      `Missing Excel field map at: ${fieldMapPath}\n\nMove/rename your file to scripts/IRS_Form_1041_Field_Map.xlsx`
    );
  }

  // ---- Load field keys from Excel ----
  const wb = XLSX.readFile(fieldMapPath);
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<FieldRow>(sheet, { defval: "" });

  const fieldRows = rows
    .map((r) => ({
      field_key: String(r.field_key || "").trim(),
      input_type: String(r.input_type || "").trim(),
      data_type: String(r.data_type || "").trim(),
      options: String((r as any).options || "").trim(),
    }))
    .filter((r) => r.field_key);

  if (fieldRows.length === 0) {
    throw new Error("Excel parsed, but no rows with field_key found.");
  }

  // ---- Load source PDF & create output PDF ----
  const srcBytes = fs.readFileSync(sourcePath);
  const srcDoc = await PDFDocument.load(srcBytes);

  const outDoc = await PDFDocument.create();
  const copiedPages = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
  copiedPages.forEach((p) => outDoc.addPage(p));

  const form = outDoc.getForm();

  // ---- Parking lot layout ----
  // We'll place fields in a clean column on each page near the left margin.
  // You’ll drag them into place using Acrobat "Prepare a form".
  const pageCount = outDoc.getPageCount();

  // field sizing in the parking lot
  const textW = 240;
  const textH = 12;
  const cbSize = 10;

  // padding/spacing
  const startX = 18;
  const topMargin = 40;
  const rowGap = 16;

  // We’ll distribute fields across pages if needed so they don’t overlap.
  let pageIndex = 0;
  let cursorY = outDoc.getPage(pageIndex).getHeight() - topMargin;

  function nextRow(heightNeeded: number) {
    cursorY -= heightNeeded;
    if (cursorY < 40) {
      pageIndex += 1;
      if (pageIndex >= pageCount) {
        // If we run out of pages, just keep using last page (still fine, but crowded)
        pageIndex = pageCount - 1;
        cursorY = outDoc.getPage(pageIndex).getHeight() - topMargin;
      } else {
        cursorY = outDoc.getPage(pageIndex).getHeight() - topMargin;
      }
    }
  }

  function addTextField(fieldName: string) {
    const page = outDoc.getPage(pageIndex);
    nextRow(rowGap);
    const tf = form.createTextField(fieldName);
    tf.setText("");
    tf.addToPage(page, {
      x: startX,
      y: cursorY,
      width: textW,
      height: textH,
    });
  }

  function addCheckBox(fieldName: string) {
    const page = outDoc.getPage(pageIndex);
    nextRow(rowGap);
    const cb = form.createCheckBox(fieldName);
    cb.addToPage(page, {
      x: startX,
      y: cursorY,
      width: cbSize,
      height: cbSize,
    });
  }

  // ---- Generate fields ----
  // Rule:
  // - if input_type indicates checkbox AND there are options -> create one checkbox per option
  // - else if checkbox with no options -> single checkbox named field_key
  // - else -> text field named field_key
  const created: Array<{
    field_key: string;
    pdf_field_name: string;
    constant_value: string | null;
    kind: "text" | "checkbox";
  }> = [];

  for (const r of fieldRows) {
    const fk = r.field_key;

    const options = parseOptions((r as any).options);
    const inputType = (r.input_type || "").toLowerCase();

    const isCheckbox =
      inputType.includes("checkbox") ||
      inputType === "checkbox" ||
      inputType === "multi_checkbox";

    if (isCheckbox && options.length > 0) {
      for (const opt of options) {
        const name = `${fk}__${slugifyOption(opt)}`;
        addCheckBox(name);
        created.push({
          field_key: fk,
          pdf_field_name: name,
          constant_value: opt,
          kind: "checkbox",
        });
      }
      continue;
    }

    if (isCheckbox && options.length === 0) {
      addCheckBox(fk);
      created.push({
        field_key: fk,
        pdf_field_name: fk,
        constant_value: null,
        kind: "checkbox",
      });
      continue;
    }

    // default: text
    addTextField(fk);
    created.push({
      field_key: fk,
      pdf_field_name: fk,
      constant_value: null,
      kind: "text",
    });
  }

  // ---- Save PDF ----
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const outBytes = await outDoc.save();
  fs.writeFileSync(outPath, outBytes);

  // ---- Also write a CSV to help you update Supabase mappings ----
  const csvPath = path.join(projectRoot, "scripts", "pdf_field_name_suggestions_1041.csv");
  const csvLines = [
    "field_key,pdf_field_name,format,constant_value",
    ...created.map((x) => {
      const format = x.kind === "checkbox" ? "checkbox" : "text";
      const cv = x.constant_value ? `"${String(x.constant_value).replace(/"/g, '""')}"` : "";
      return `${x.field_key},${x.pdf_field_name},${format},${cv}`;
    }),
  ];
  fs.writeFileSync(csvPath, csvLines.join("\n"), "utf8");

  console.log("✅ Generated fillable PDF:", outPath);
  console.log("✅ Wrote mapping helper CSV:", csvPath);
  console.log(`✅ Created ${created.length} PDF fields (parking-lot layout).`);
}

main().catch((err) => {
  console.error("Error generating fillable 1041:", err);
  process.exit(1);
});
