"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
};

type Filing = {
  id: string;
  client_id: string;
  filing_type: "1041" | "706" | "709" | "PA-41";
  tax_year: number;
  status: string;
  updated_at?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [firmName, setFirmName] = useState<string | null>(null);
  const [firmId, setFirmId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [filingsByClient, setFilingsByClient] = useState<Record<string, Filing[]>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({}); // which client rows are expanded

  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }
      setEmail(session.user.email ?? null);

      // Get firm for this user
      const { data: mships, error: mErr } = await supabase
        .from("firm_members")
        .select("firm_id")
        .eq("user_id", session.user.id)
        .limit(1);
      if (mErr || !mships?.length) {
        router.replace("/onboarding");
        return;
      }
      const fId = mships[0].firm_id as string;
      setFirmId(fId);

      const { data: firm, error: fErr } = await supabase
        .from("firms")
        .select("name")
        .eq("id", fId)
        .single();
      if (!fErr) setFirmName(firm?.name ?? null);

      // Load clients for firm
      const { data: clientRows, error: cErr } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, phone")
        .eq("firm_id", fId)
        .order("last_name", { ascending: true });

      if (cErr) {
        console.error(cErr);
        setLoading(false);
        return;
      }
      setClients(clientRows ?? []);

      // If there are clients, load filings for all of them
      if (clientRows?.length) {
        const ids = clientRows.map(c => c.id);
        const { data: filingRows, error: flErr } = await supabase
          .from("filings")
          .select("id, client_id, filing_type, tax_year, status, updated_at")
          .in("client_id", ids)
          .order("tax_year", { ascending: false });

        if (!flErr && filingRows) {
          const map: Record<string, Filing[]> = {};
          for (const f of filingRows) {
            (map[f.client_id] ||= []).push(f);
          }
          setFilingsByClient(map);
        }
      }

      setLoading(false);
    };
    run();
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <main className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold">Solace Tax Dashboard</h1>
        <div className="flex items-center gap-3">
          {firmName && (
            <span className="text-xs rounded-full border px-2 py-1 text-muted-foreground">
              Firm: {firmName}
            </span>
          )}
          <span className="text-sm text-muted-foreground">{email}</span>
          <button
            onClick={signOut}
            className="rounded-xl border px-3 py-1.5 hover:bg-muted"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Clients → Filings (read-only) */}
      <section className="rounded-2xl border">
        <div className="p-4 border-b bg-black rounded-t-2xl">
          <h2 className="font-medium text-white">Clients</h2>
          <p className="text-sm text-gray-400">
            Expand a client to view their filings.
          </p>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No clients yet.</div>
        ) : (
          <ul className="divide-y">
            {clients.map((c) => {
              const key = c.id;
              const filings = filingsByClient[key] ?? [];
              const isOpen = !!open[key];
              return (
                <li key={key} className="p-4">
                  <button
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => setOpen((s) => ({ ...s, [key]: !isOpen }))}
                  >
                    <div>
                      <div className="font-medium">
                        {c.last_name}, {c.first_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.email ?? "—"} {c.phone ? `• ${c.phone}` : ""}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {isOpen ? "Hide filings ▲" : `Show filings (${filings.length}) ▼`}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 rounded-xl border bg-background overflow-hidden">
                      {filings.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">No filings yet.</div>
                      ) : (
                        <table className="w-full text-sm border-collapse">
                          <thead className="bg-[#616569] text-white">
                            <tr className="text-left text-xs">
                              <th className="p-3 rounded-tl-xl">Filing</th>
                              <th className="p-3">Tax year</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 rounded-tr-xl">Updated</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filings.map((f, i) => (
                              <tr
                                key={f.id}
                                className={`border-b last:border-0 ${
                                  i % 2 === 0 ? "bg-gray-50" : "bg-white"
                                }`}
                              >
                                <td className={`p-3 font-medium ${i === filings.length - 1 ? "rounded-bl-xl" : ""}`}>{f.filing_type}</td>
                                <td className="p-3">{f.tax_year}</td>
                                <td className="p-3">
                                  <span className="rounded-full border px-2 py-0.5 text-xs bg-gray-100">
                                    {f.status}
                                  </span>
                                </td>
                                <td className={`p-3 text-xs text-muted-foreground ${i === filings.length - 1 ? "rounded-br-xl" : ""}`}>
                                  {f.updated_at
                                    ? new Date(f.updated_at).toLocaleString()
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
