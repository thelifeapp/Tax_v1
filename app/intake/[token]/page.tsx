// app/intake/[token]/page.tsx

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import IntakeQuestionFlow from "@/components/ui/intake/IntakeQuestionFlow";
import type { FormField, FormAnswer } from "@/types/forms";

interface Props {
  params: Promise<{ token: string }>; // 👈 Promise-wrapped params
}

export default async function ClientIntakePage({ params }: Props) {
  const supabase = createClient();
  const { token } = await params; // 👈 unwrap the Promise

  // 1. Look up the invite + filing via the token
  const { data: invite, error: inviteError } = await supabase
    .from("client_invites")
    .select("id, status, filings(id, filing_type, tax_year)")
    .eq("token", token)
    .single();

  if (inviteError || !invite || !invite.filings) {
    console.error(inviteError);
    redirect("/");
  }

  // Normalize filings to a single filing object
  const filings = invite.filings as
    | { id: any; filing_type: any; tax_year: any }
    | { id: any; filing_type: any; tax_year: any }[];

  const filing = Array.isArray(filings) ? filings[0] : filings;

  if (!filing) {
    redirect("/");
  }

  const formCode = filing.filing_type;

  if (formCode !== "1041") {
    redirect("/");
  }

  // Capture inviteId so TS knows it's non-null inside the server action
  const inviteId = invite.id;

  // 2. Load fields for the client audience
  const { data: fields, error: fieldsError } = await supabase.rpc(
    "get_intake_fields",
    {
      _form_code: formCode,
      _audience_mode: "client",
    }
  );

  if (fieldsError || !fields) {
    console.error(fieldsError);
    redirect("/");
  }

  // 3. Load any existing answers
  const { data: answers, error: answersError } = await supabase.rpc(
    "get_form_answers",
    {
      _filing_id: filing.id,
      _form_code: formCode,
    }
  );

  if (answersError) {
    console.error(answersError);
  }

  const typedFields = fields as FormField[];
  const typedAnswers = (answers ?? []) as FormAnswer[];

  // 4. Server action to mark invite as submitted
  async function handleSubmitForReview() {
    "use server";

    const sb = createClient();
    const { error } = await sb
      .from("client_invites")
      .update({ status: "submitted" })
      .eq("id", inviteId);

    if (error) {
      console.error(error);
    }
  }

  return (
    <main className="p-6">
      <div className="max-w-3xl mx-auto mb-4">
        <h1 className="text-xl font-semibold">1041 Intake</h1>
        <p className="text-sm text-muted-foreground">
          Your answers will be shared with your CPA / lawyer for review.
        </p>
      </div>

      <IntakeQuestionFlow
        filingId={filing.id}
        formCode={formCode}
        mode="client"
        fields={typedFields}
        answers={typedAnswers}
        showSubmitForReview={invite.status !== "submitted"}
        onSubmitForReview={handleSubmitForReview}
      />
    </main>
  );
}
