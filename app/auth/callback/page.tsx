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
      const url = new URL(window.location.href);

      // ---- 1) Handle explicit error responses from Supabase (otp_expired, etc.) ----
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const hashParams = new URLSearchParams(hash);
      const error = hashParams.get("error");
      const errorDescription = hashParams.get("error_description");

      if (error) {
        console.error("Supabase redirect error:", error, errorDescription);
        setStatus("error");
        setMessage(
          decodeURIComponent(
            errorDescription ||
              "This magic link is invalid or has expired. Please request a new one from the login page."
          )
        );
        return;
      }

      // ---- 2) Normal success path: let Supabase parse the URL (hash or ?code) ----
      try {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(window.location.href);

        if (exchangeError) {
          console.error("exchangeCodeForSession error", exchangeError);
          setStatus("error");
          setMessage(
            exchangeError.message ||
              "We couldn’t sign you in. Please request a new magic link."
          );
          return;
        }

        // Session is now stored; send them to dashboard
        router.replace("/dashboard");
      } catch (err) {
        console.error(err);
        setStatus("error");
        setMessage(
          "Unexpected error while signing you in. Please try requesting a new magic link."
        );
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
