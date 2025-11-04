"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [firmName, setFirmName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      const userEmail = data.session.user.email ?? null;
      setEmail(userEmail);

      // Find a membership
      const { data: mships, error: mErr } = await supabase
        .from("firm_members")
        .select("firm_id")
        .limit(1);

      if (mErr) {
        console.error(mErr);
        setChecking(false);
        return;
      }

      const firmId = mships?.[0]?.firm_id as string | undefined;
      if (firmId) {
        // Look up firm name
        const { data: firms, error: fErr } = await supabase
          .from("firms")
          .select("name")
          .eq("id", firmId)
          .limit(1);

        if (fErr) console.error(fErr);
        setFirmName(firms?.[0]?.name ?? null);
        localStorage.setItem("firmId", String(firmId));
      } else {
        // No firm? Send to onboarding to capture details
        router.replace("/onboarding");
        return;
      }

      setChecking(false);
    };
    run();
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (checking) {
    return (
      <main className="min-h-screen grid place-items-center p-8">
        <p className="text-muted-foreground">Loading dashboard…</p>
      </main>
    );
  }

  return (
    <main className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lawyer Dashboard</h1>
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

      <div className="rounded-2xl border p-6">
        <p className="text-sm text-muted-foreground">
          Welcome! This is where the nested Clients → Filings list will go.
        </p>
      </div>
    </main>
  );
}
