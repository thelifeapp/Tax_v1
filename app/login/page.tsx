"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setMessage(null);

    const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
    setMessage("Check your email for a magic link.");
  };

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we’ll send you a magic link.
        </p>

        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@firm.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
        />

        {message && (
          <p className={`text-sm ${status === "error" ? "text-red-600" : "text-muted-foreground"}`}>
            {status === "sent" ? `We sent a magic link to ${email}.` : message}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "sending" || !email}
          className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Send magic link"}
        </button>
      </form>
    </main>
  );
}
