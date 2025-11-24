"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Inner client component that actually uses useSearchParams and runs
 * the Supabase auth + firm membership logic.
 * This MUST be rendered inside a <Suspense> boundary in Next 16.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const run = async () => {
      // 1) Complete magic link sign-in
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("exchangeCodeForSession:", error);
          return router.replace("/login");
        }
      }

      // 2) Do they already belong to a firm?
      const { data: mships, error } = await supabase
        .from("firm_members")
        .select("firm_id")
        .limit(1);

      if (error) {
        console.error("firm_members check:", error);
        // fail-open to dashboard on error
        return router.replace("/dashboard");
      }

      if (mships && mships.length > 0) {
        localStorage.setItem("firmId", String(mships[0].firm_id));
        return router.replace("/dashboard");
      }

      // 3) No firm yet → onboarding to capture name & firm
      router.replace("/onboarding");
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <p className="text-muted-foreground">Finishing sign-in…</p>
    </main>
  );
}

/**
 * Page component that wraps the inner client component in Suspense,
 * satisfying Next.js 16's requirement for useSearchParams().
 */
export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen grid place-items-center p-8">
          <p className="text-muted-foreground">Finishing sign-in…</p>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
