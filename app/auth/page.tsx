"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    const run = async () => {
      try {
        // Use the full URL (including ?code=...) to exchange for a session
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );

        if (error) {
          console.error("exchangeCodeForSession error", error);
          setStatus("error");
          setMessage(error.message || "We couldn’t sign you in.");
          return;
        }

        // Session is now stored in browser; go to dashboard
        router.replace("/dashboard");
      } catch (err) {
        console.error(err);
        setStatus("error");
        setMessage("Unexpected error while signing you in.");
      }
    };

    run();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6">
        <h1 className="text-xl font-semibold">
          {status === "loading" ? "Signing you in…" : "Sign-in problem"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        {status === "error" && (
          <button
            onClick={() => router.replace("/login")}
            className="mt-4 rounded-xl border px-3 py-2 text-sm"
          >
            Back to login
          </button>
        )}
      </div>
    </main>
  );
}
