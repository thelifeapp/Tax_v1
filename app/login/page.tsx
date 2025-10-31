"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const redirectTo =
      `${process.env.NEXT_PUBLIC_BASE_URL}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <main className="max-w-md mx-auto p-8">
        <h1 className="text-2xl font-semibold mb-2">Check your email</h1>
        <p className="text-muted-foreground">
          We sent a magic link to <span className="font-medium">{email}</span>.
          Click it to finish signing in.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we’ll send you a magic link.
        </p>
        <input
          type="email"
          required
          placeholder="you@lawfirm.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-white hover:opacity-90"
        >
          Send magic link
        </button>
      </form>
    </main>
  );
}
