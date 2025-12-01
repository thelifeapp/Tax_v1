// app/filings/[filingId]/intake/page.tsx

import { notFound } from "next/navigation";
import { Pool } from "pg";
import { Form1041Wizard } from "@/components/ui/forms/Form1041Wizard";
import type { AudienceMode, FormField1041 } from "@/types/forms";

// -----------------------------------------------------------------------------
// DB setup
// -----------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing (check .env.local)");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -----------------------------------------------------------------------------
// Load filing metadata
// -----------------------------------------------------------------------------

async function getFiling(filingId: string) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      SELECT id, tax_year, filing_type
      FROM public.filings
      WHERE id = $1
      LIMIT 1
      `,
      [filingId]
    );

    return res.rows[0] ?? null;
  } finally {
    client.release();
  }
}

// -----------------------------------------------------------------------------
// Load 1041 fields + existing answers
// -----------------------------------------------------------------------------

async function get1041FieldsAndAnswers(filingId: string) {
  const client = await pool.connect();

  try {
    const fieldsRes = await client.query(
      `
      SELECT
        id, template_id, field_key, label, help_text, type, required,
        section, "order", audience, validations, core_key, form_code,
        data_type, input_type, is_calculated, calculation, source_notes,
        visibility_condition, options, line_it
      FROM public.form_fields
      WHERE form_code = '1041'
      ORDER BY section NULLS LAST, "order" ASC
      `
    );

    const fields: FormField1041[] = fieldsRes.rows.map((row: any) => ({
      id: row.id,
      template_id: row.template_id,
      field_key: row.field_key,
      label: row.label,
      help_text: row.help_text,
      type: row.type,
      required: row.required ?? false,
      section: row.section,
      order: row.order,
      audience: row.audience,
      validations: row.validations,
      core_key: row.core_key,
      form_code: "1041",
      data_type: row.data_type,
      input_type: row.input_type,
      is_calculated: row.is_calculated ?? false,
      calculation: row.calculation,
      source_notes: row.source_notes,
      visibility_condition: row.visibility_condition,
      options: Array.isArray(row.options)
        ? row.options.map((o: any) => String(o))
        : null,
      line_it: row.line_it ?? null,
    }));

    const answersRes = await client.query(
      `
      SELECT field_key, value
      FROM public.form_answers
      WHERE filing_id = $1
      `,
      [filingId]
    );

    const initialAnswers: Record<string, any> = {};
    for (const row of answersRes.rows) {
      initialAnswers[row.field_key] = row.value;
    }

    return { fields, initialAnswers };
  } finally {
    client.release();
  }
}

// -----------------------------------------------------------------------------
// Server Action: Save answers
// -----------------------------------------------------------------------------

async function saveAnswers(filingId: string, answers: Record<string, any>) {
  "use server";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM public.form_answers WHERE filing_id = $1`,
      [filingId]
    );

    const entries = Object.entries(answers);

    if (entries.length > 0) {
      const placeholders: string[] = [];
      const values: any[] = [];

      entries.forEach(([fieldKey, value], index) => {
        const base = index * 3;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3})`
        );
        values.push(filingId, fieldKey, JSON.stringify(value));
      });

      await client.query(
        `INSERT INTO public.form_answers (filing_id, field_key, value)
         VALUES ${placeholders.join(", ")}`,
        values
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[saveAnswers] Error:", err);
    throw err;
  } finally {
    client.release();
  }
}

// -----------------------------------------------------------------------------
// Page Component
// -----------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ filingId: string }>; // 👈 Promise params
};

export default async function IntakePage({ params }: PageProps) {
  const { filingId } = await params; // 👈 unwrap the Promise

  const filing = await getFiling(filingId);
  if (!filing) notFound();

  const { fields, initialAnswers } = await get1041FieldsAndAnswers(filingId);

  const audience: AudienceMode = "lawyer";

  const handleSubmit = async (answers: Record<string, any>) => {
    "use server";
    return await saveAnswers(filingId, answers);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">1041 Intake</h1>
        <p className="text-sm text-gray-600">
          Tax year {filing.tax_year}. Your answers save automatically.
        </p>
      </div>

      <Form1041Wizard
        audience={audience}
        fields={fields}
        initialAnswers={initialAnswers}
        onSubmit={handleSubmit}
        filingId={filingId}
      />
    </div>
  );
}
