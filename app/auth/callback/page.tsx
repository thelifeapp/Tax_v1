"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get("code");
    // The magic link arrives with ?code=...; exchange it for a session.
    const run = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error(error);
          router.replace("/login");
          return;
        }
        router.replace("/dashboard");
      } else {
        // If user is already signed in, go straight to dashboard.
        const { data } = await supabase.auth.getSession();
        if (data.session) router.replace("/dashboard");
        else router.replace("/login");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <p className="text-muted-foreground">Signing you in…</p>
    </main>
  );
}
