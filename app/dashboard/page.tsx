"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? null);
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
          <span className="text-sm text-muted-foreground">{email}</span>
          <button
            onClick={signOut}
            className="rounded-xl border px-3 py-1.5 hover:bg-muted"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Stub content — replace with your nested Clients → Filings table */}
      <div className="rounded-2xl border p-6">
        <p className="text-sm text-muted-foreground">
          Welcome! This is where the nested Clients → Filings list will go.
        </p>
      </div>
    </main>
  );
}
