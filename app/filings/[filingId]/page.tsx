// app/filings/[filingId]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: { filingId: string };
}

export default async function FilingDetailPage({ params }: PageProps) {
  const supabase = createClient();
  const filingId = params.filingId;

  // 1. Load the filing row
  const { data: filing, error: filingError } = await supabase
    .from("filings")
    .select("id, client_id, filing_type, tax_year, status, created_at, updated_at")
    .eq("id", filingId)
    .single();

  if (filingError || !filing) {
    console.error(filingError);
    notFound();
  }

  // 2. Load the client (for display)
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("first_name, last_name, email")
    .eq("id", filing.client_id)
    .single();

  if (clientError) {
    console.error(clientError);
  }

  const clientName =
    client ? `${client.first_name} ${client.last_name}` : "Client";

  return (
    <main className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold mb-1">
            {filing.filing_type} – Tax year {filing.tax_year}
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientName} • Status:{" "}
            <span className="font-medium">{filing.status}</span>
          </p>
        </div>

        {/* Meta info */}
        <div className="rounded-xl border bg-white p-4 text-sm space-y-1">
          <div>
            <span className="font-medium">Filing ID:</span> {filing.id}
          </div>
          <div>
            <span className="font-medium">Created:</span>{" "}
            {new Date(filing.created_at).toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Last updated:</span>{" "}
            {new Date(filing.updated_at).toLocaleString()}
          </div>
          {client && (
            <div>
              <span className="font-medium">Client email:</span>{" "}
              {client.email ?? "—"}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {/* Lawyer / CPA intake flow */}
          <Link href={`/filings/${filing.id}/intake`}>
            <Button>Open lawyer intake</Button>
          </Link>

          {/* Back to dashboard */}
          <Link href="/dashboard">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </div>

        {/* Placeholder for future: summaries, documents, etc. */}
        <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
          <p>
            This is the filing detail view. In future versions, this is where
            you&apos;ll see a summary of answers, attached documents, and status
            history for this filing.
          </p>
        </div>
      </div>
    </main>
  );
}
