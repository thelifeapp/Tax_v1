// app/filings/[filingId]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { Pool } from "pg";
import { Button } from "@/components/ui/button";

// -----------------------------------------------------------------------------
// DB setup (same pattern as intake page)
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
// Load filing + client via direct SQL
// -----------------------------------------------------------------------------

async function getFilingWithClient(filingId: string) {
  const client = await pool.connect();

  try {
    const res = await client.query(
      `
      SELECT
        f.id,
        f.client_id,
        f.filing_type,
        f.tax_year,
        f.status,
        f.created_at,
        f.updated_at,
        c.first_name,
        c.last_name,
        c.email
      FROM public.filings f
      LEFT JOIN public.clients c
        ON c.id = f.client_id
      WHERE f.id = $1
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

// -----------------------------------------------------------------------------
// Page component
// -----------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ filingId: string }>; // 👈 Promise-wrapped params in your setup
};

export default async function FilingDetailPage({ params }: PageProps) {
  const { filingId } = await params; // 👈 unwrap the Promise

  const row = await getFilingWithClient(filingId);
  if (!row) {
    notFound();
  }

  const clientName =
    row.first_name && row.last_name
      ? `${row.first_name} ${row.last_name}`
      : "Client";

  return (
    <main className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold mb-1">
            {row.filing_type} – Tax year {row.tax_year}
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientName} • Status:{" "}
            <span className="font-medium">{row.status}</span>
          </p>
        </div>

        {/* Meta info */}
        <div className="rounded-xl border bg-white p-4 text-sm space-y-1">
          <div>
            <span className="font-medium">Filing ID:</span> {row.id}
          </div>
          <div>
            <span className="font-medium">Created:</span>{" "}
            {new Date(row.created_at).toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Last updated:</span>{" "}
            {new Date(row.updated_at).toLocaleString()}
          </div>
          {row.email && (
            <div>
              <span className="font-medium">Client email:</span> {row.email}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Link href={`/filings/${row.id}/intake`}>
            <Button>Open lawyer intake</Button>
          </Link>

          <Link href="/dashboard">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </div>

        {/* Placeholder for future: summaries, docs, etc. */}
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
