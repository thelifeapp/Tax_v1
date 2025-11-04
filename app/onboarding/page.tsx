"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [firm, setFirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive a friendly default firm name from email domain
  const suggestFirmFromEmail = (e: string) => {
    if (!e.includes("@")) return "";
    const domain = e.split("@")[1] ?? "";
    const base = domain.replace(/\..*$/, "").replace(/[-_.]/g, " ").trim();
    if (!base) return "";
    const pretty = base.charAt(0).toUpperCase() + base.slice(1);
    return `${pretty} Law`;
  };

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      // If not signed in, force them to start at /login (magic link)
      if (!data.user) {
        router.replace("/login");
        return;
      }
  
      const e = data.user.email ?? "";
      setEmail(e);
      if (!firm) setFirm(suggestFirmFromEmail(e));
      const fallbackName = e ? e.split("@")[0] : "";
      if (!first && !last && fallbackName) setFirst(fallbackName);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (!email) throw new Error("You are not signed in.");
      if (!first.trim() || !last.trim() || !firm.trim()) {
        throw new Error("Please complete all fields.");
      }

      const fullName = `${first.trim()} ${last.trim()}`;

      // Call server-side bootstrap to create profile, firm, membership
      const { data: firmId, error: rpcError } = await supabase.rpc("bootstrap_user", {
        p_email: email,
        p_full_name: fullName,
        p_firm_name: firm.trim(),
        p_practice_states: null,
        p_estimated_users: null
      });

      if (rpcError) throw rpcError;
      if (firmId) localStorage.setItem("firmId", String(firmId));

      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Onboarding failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-lg space-y-5 rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Set up your account</h1>

        <div>
          <label className="text-sm text-muted-foreground">Email</label>
          <input value={email} readOnly className="mt-1 w-full rounded-xl border px-3 py-2 bg-muted/40" />
          <p className="text-xs text-muted-foreground mt-1">This email has been verified via magic link.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm text-muted-foreground">First name</label>
            <input
              required
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="e.g., Emily"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Last name</label>
            <input
              required
              value={last}
              onChange={(e) => setLast(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="e.g., Evanko"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Firm name</label>
          <input
            required
            value={firm}
            onChange={(e) => setFirm(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
            placeholder="e.g., Evanko Law"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Continue"}
          </button>
          <button
            type="button"
            onClick={() => location.replace("/login")}
            className="rounded-xl border px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
