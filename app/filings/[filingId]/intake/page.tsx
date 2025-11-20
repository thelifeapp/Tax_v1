// app/filings/[filingId]/intake/page.tsx

import { notFound } from "next/navigation";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import IntakeQuestionFlow from "@/components/ui/intake/IntakeQuestionFlow";
import type { FormField, FormAnswer } from "@/types/forms";

// SERVER-ONLY admin client - uses service-role key
const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
);

interface Props {
  // In Next 16, params is a Promise that must be awaited
  params: Promise<{ filingId: string }>;
}

export default async function FilingIntakePage({ params }: Props) {
  // ✅ unwrap params
  const { filingId } = await params;

  if (!filingId) {
    console.error("[FilingIntakePage] No filingId in route params");
    return notFound();
  }

  console.log("[FilingIntakePage] Loading filing:", filingId);

  // 1. Load the filing
  const { data: filing, error: filingError } = await supabaseAdmin
    .from("filings")
    .select("id, filing_type, tax_year")
    .eq("id", filingId)
    .single();

  if (filingError || !filing) {
    console.error("[FilingIntakePage] Error loading filing:", filingError);
    return notFound();
  }

  // 🔑 THIS WAS MISSING
  const formCode = String(filing.filing_type); // e.g. "1041"

  // Only support 1041 for now
  if (formCode !== "1041") {
    console.error("[FilingIntakePage] Unsupported formCode:", formCode);
    return notFound();
  }

  // 2. Load all 1041 fields for lawyer view directly from form_fields
  const { data: fields, error: fieldsError } = await supabaseAdmin
    .from("form_fields")
    .select(
      "field_key, label, help_text, type, required, section, order, audience, core_key, form_code"
    )
    .eq("form_code", formCode);

  if (fieldsError || !fields) {
    console.error(
      "[FilingIntakePage] Error loading form_fields for 1041:",
      fieldsError
    );
    return notFound();
  }

  // Filter by audience for CPA/lawyer view
  const lawyerFields = (fields as any[]).filter((f) => {
    // audience: 'both' | 'client' | 'lawyer' (text)
    return f.audience === "both" || f.audience === "lawyer" || !f.audience;
  });

  // 3. Load any existing answers for this filing
  const { data: answers, error: answersError } = await supabaseAdmin
    .from("form_answers")
    .select("filing_id, field_key, value, source, updated_at")
    .eq("filing_id", filing.id);

  if (answersError) {
    console.error(
      "[FilingIntakePage] Error loading form_answers:",
      answersError
    );
  }

  const typedFields = lawyerFields as FormField[];
  const typedAnswers = (answers ?? []) as FormAnswer[];

  return (
    <main className="p-6">
      <div className="max-w-3xl mx-auto mb-4">
        <h1 className="text-xl font-semibold">1041 Intake</h1>
        <p className="text-sm text-muted-foreground">
          Tax year {filing.tax_year}. Your answers save automatically for this
          filing.
        </p>
      </div>

      <IntakeQuestionFlow
        filingId={filing.id}
        formCode={formCode}
        mode="lawyer"
        fields={typedFields}
        answers={typedAnswers}
      />
    </main>
  );
}
