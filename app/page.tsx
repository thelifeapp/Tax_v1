// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [ok, setOk] = useState<"checking" | "yes" | "no">("checking");

  useEffect(() => {
    // Very simple check that the client is alive and can call the SDK
    supabase.auth.getSession()
      .then(() => setOk("yes"))
      .catch(() => setOk("no"));
  }, []);

  return (
    <main className="p-10 space-y-4">
      <h1 className="text-2xl font-semibold">Supabase connection test</h1>
      <p className="text-sm text-muted-foreground">
        Supabase client loaded: {ok === "checking" ? "…checking" : ok === "yes" ? "✅ yes" : "❌ no"}
      </p>
    </main>
  );
}
