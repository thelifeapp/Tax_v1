"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      // 1) Do we have a Supabase session at all?
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Error getting Supabase session:", error);
        // If something breaks, fail-open to login
        router.replace("/login");
        return;
      }

      const session = data?.session;

      if (!session) {
        // Not logged in → go to login screen
        router.replace("/login");
        return;
      }

      // 2) We have a session → check firm membership
      const { data: mships, error: mshipError } = await supabase
        .from("firm_members")
        .select("firm_id")
        .limit(1);

      if (mshipError) {
        console.error("firm_members check:", mshipError);
        // If this check fails, send them to dashboard rather than kicking them out
        router.replace("/dashboard");
        return;
      }

      if (mships && mships.length > 0) {
        // Save firm ID for the rest of the app
        if (typeof window !== "undefined") {
          localStorage.setItem("firmId", String(mships[0].firm_id));
        }
        router.replace("/dashboard");
      } else {
        // No firm yet → onboarding flow
        router.replace("/onboarding");
      }
    };

    run();
  }, [router]);

  // While we’re figuring out where to send them:
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <p className="text-muted-foreground">Checking your session…</p>
    </main>
  );
}
