"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import NewClientDialog from "@/components/ui/NewClientDialog";
import NewFilingDialog from "@/components/ui/NewFilingDialog";
import { Trash2 } from "lucide-react";
import { Download1041PdfButton } from "@/components/ui/Download1041PdfButton"; // 👈 NEW

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

const displayUSPhone = (raw: string | null) => {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
};

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [firmName, setFirmName] = useState<string | null>(null);
  const [firmId, setFirmId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [filingsByClient, setFilingsByClient] = useState<
    Record<string, Filing[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [deletingFilingId, setDeletingFilingId] = useState<string | null>(null);

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }
      setEmail(session.user.email ?? null);

      // Firm membership
      const { data: mships, error: mErr } = await supabase
        .from("firm_members")
        .select("firm_id")
        .eq("user_id", session.user.id)
        .limit(1);

      if (mErr || !mships?.length) {
        router.replace("/onboarding");
        return;
      }

      const fId = (mships[0] as any).firm_id as string;
      setFirmId(fId);

      const { data: firm, error: fErr } = await supabase
        .from("firms")
        .select("name")
        .eq("id", fId)
        .single();

      if (!fErr) setFirmName(firm?.name ?? null);

      // Load clients
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

      // Load filings for clients
      if (clientRows?.length) {
        const ids = clientRows.map((c) => c.id);

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
  }, [router, refreshKey]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const deleteClient = async (clientId: string, clientLabel: string) => {
    const ok = confirm(`Delete client "${clientLabel}" and ALL their filings?`);
    if (!ok) return;
    setDeletingClientId(clientId);

    try {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId);
      if (error) {
        console.error(error);
        alert(`Delete failed: ${error.message}`);
      } else {
        triggerRefresh();
      }
    } finally {
      setDeletingClientId(null);
    }
  };

  const deleteFiling = async (filing: Filing) => {
    const label = `${filing.filing_type} ${filing.tax_year}`;
    const ok = confirm(
      `Delete filing "${label}" and ALL of its answers/line items?`
    );
    if (!ok) return;

    setDeletingFilingId(filing.id);

    try {
      // Delete related data first (no ON DELETE CASCADE in schema)
      await supabase
        .from("form_answers")
        .delete()
        .eq("filing_id", filing.id);

      await supabase
        .from("intake_sessions")
        .delete()
        .eq("filing_id", filing.id);

      await supabase
        .from("client_invites")
        .delete()
        .eq("filing_id", filing.id);

      // Finally delete the filing itself
      const { error } = await supabase
        .from("filings")
        .delete()
        .eq("id", filing.id);

      if (error) {
        console.error(error);
        alert(`Delete failed: ${error.message}`);
      } else {
        triggerRefresh();
      }
    } finally {
      setDeletingFilingId(null);
    }
  };

  return (
    <main className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold">
          Solace Tax Dashboard
        </h1>

        <div className="flex items-center gap-3">
          {firmId && (
            <NewClientDialog firmId={firmId} onCreated={triggerRefresh} />
          )}

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

      {/* Clients → Filings */}
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
          <div className="p-6 text-sm text-muted-foreground">
            No clients yet.
          </div>
        ) : (
          <ul className="divide-y">
            {clients.map((c) => {
              const key = c.id;
              const filings = filingsByClient[key] ?? [];
              const isOpen = !!open[key];

              return (
                <li key={key} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* Expand / collapse client row */}
                    <button
                      className="flex-1 flex items-center justify-between text-left cursor-pointer hover:bg-muted/40 rounded-lg px-2 py-1"
                      onClick={() =>
                        setOpen((s) => ({
                          ...s,
                          [key]: !isOpen,
                        }))
                      }
                    >
                      <div>
                        <div className="font-medium">
                          {c.last_name}, {c.first_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.email ?? "—"}{" "}
                          {c.phone ? `• ${displayUSPhone(c.phone)}` : ""}
                        </div>
                      </div>

                      <span className="text-xs text-muted-foreground">
                        {isOpen
                          ? "Hide filings ▲"
                          : `Show filings (${filings.length}) ▼`}
                      </span>
                    </button>

                    {/* New Filing */}
                    <NewFilingDialog
                      clientId={c.id}
                      clientName={`${c.last_name}, ${c.first_name}`}
                      clientEmail={c.email}
                      onCreated={triggerRefresh}
                    />

                    {/* Delete Client */}
                    <button
                      onClick={() =>
                        deleteClient(c.id, `${c.last_name}, ${c.first_name}`)
                      }
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      disabled={deletingClientId === c.id}
                      title="Delete client"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </button>
                  </div>

                  {/* Filings list */}
                  {isOpen && (
                    <div className="mt-3 rounded-xl border bg-background overflow-hidden">
                      {filings.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">
                          No filings yet.
                        </div>
                      ) : (
                        <table className="w-full text-sm border-collapse">
                          <thead className="bg-[#616569] text-white">
                            <tr className="text-left text-xs">
                              <th className="p-3 rounded-tl-xl">Filing</th>
                              <th className="p-3">Tax year</th>
                              <th className="p-3">Status</th>
                              <th className="p-3">Updated</th>
                              <th className="p-3 rounded-tr-xl text-right">
                                Actions
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {filings.map((f, i) => (
                              <tr
                                key={f.id}
                                onClick={() =>
                                  router.push(`/filings/${f.id}/intake`)
                                }
                                className={`border-b last:border-0 cursor-pointer hover:bg-gray-100 ${
                                  i % 2 === 0 ? "bg-gray-50" : "bg-white"
                                }`}
                              >
                                <td
                                  className={`p-3 font-medium ${
                                    i === filings.length - 1
                                      ? "rounded-bl-xl"
                                      : ""
                                  }`}
                                >
                                  {f.filing_type}
                                </td>

                                <td className="p-3">{f.tax_year}</td>

                                <td className="p-3">
                                  <span className="rounded-full border px-2 py-0.5 text-xs bg-gray-100">
                                    {f.status}
                                  </span>
                                </td>

                                <td className="p-3 text-xs text-muted-foreground">
                                  {f.updated_at
                                    ? new Date(f.updated_at).toLocaleString()
                                    : "—"}
                                </td>

                                <td
                                  className={`p-3 text-right ${
                                    i === filings.length - 1
                                      ? "rounded-br-xl"
                                      : ""
                                  }`}
                                >
                                  <div className="flex items-center justify-end gap-2">
                                    {/* Download 1041 PDF button (small icon) */}
                                    <Download1041PdfButton
                                      filingId={f.id}
                                      iconOnly
                                    />

                                    {/* Delete filing */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation(); // don't navigate
                                        deleteFiling(f);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                      disabled={deletingFilingId === f.id}
                                      title="Delete filing"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
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
