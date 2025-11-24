// app/filings/[filingId]/intake/page.tsx

import { notFound } from "next/navigation";
import { Pool } from "pg";
import { Form1041Wizard } from "@/components/ui/forms/Form1041Wizard";
import type { AudienceMode, FormField1041 } from "@/types/forms";

// -----------------------------------------------------------------------------
// DB setup (reuse same pattern as /api/forms/sync)
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
// Data loaders
// -----------------------------------------------------------------------------

async function getFiling(filingId: string) {
  const client = await pool.connect();
  try {
    const res = await client.query<{
      id: string;
      tax_year: number;
      filing_type: string;
    }>(
      `
      SELECT id, tax_year, filing_type
      FROM public.filings
      WHERE id = $1
      LIMIT 1
    `,
      [filingId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    return res.rows[0];
  } finally {
    client.release();
  }
}

async function get1041FieldsAndAnswers(filingId: string) {
  const client = await pool.connect();

  try {
    // 1) Load all 1041 fields from form_fields
    const fieldsRes = await client.query<any>(
      `
      SELECT
        id,
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
      FROM public.form_fields
      WHERE form_code = '1041'
      ORDER BY section NULLS LAST, "order" ASC
    `
    );

    const fields: FormField1041[] = fieldsRes.rows.map((row: any) => {
      let options: string[] | null = null;
      if (row.options && Array.isArray(row.options)) {
        options = row.options.map((o: any) => String(o));
      }

      return {
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
        options,
      };
    });

    // 2) Load any existing answers for this filing
    const answersRes = await client.query<{
      field_key: string;
      value: any;
    }>(
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
// Page component (Next.js 16: params is a Promise)
// -----------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ filingId: string }>;
};

export default async function IntakePage({ params }: PageProps) {
  // ⬅️ THIS is the key change: await params
  const { filingId } = await params;

  const filing = await getFiling(filingId);
  if (!filing) {
    notFound();
  }

  const { fields, initialAnswers } = await get1041FieldsAndAnswers(filingId);

  if (!fields || fields.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 py-6">
        <h1 className="text-2xl font-semibold text-gray-900">1041 Intake</h1>
        <p className="text-sm text-gray-600">
          No 1041 field metadata is configured yet. Please run the forms sync.
        </p>
      </div>
    );
  }

  const audience: AudienceMode = "lawyer";

  async function handleSubmit(answers: Record<string, any>) {
    "use server";
    // TODO: implement saving into public.form_answers
    console.log("TODO: save answers for filing", filingId, answers);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">1041 Intake</h1>
        <p className="text-sm text-gray-600">
          Tax year {filing.tax_year}. Your answers save automatically for this
          filing.
        </p>
        <p className="mt-2 text-xs uppercase tracking-wide text-gray-400">
          1041 Intake · Professional View
        </p>
        <p className="text-xs text-gray-500">
          Answer the questions below as best you can. Your answers save automatically.
        </p>
      </div>

      {/* Wizard */}
      <Form1041Wizard
        audience={audience}
        fields={fields}
        initialAnswers={initialAnswers}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
