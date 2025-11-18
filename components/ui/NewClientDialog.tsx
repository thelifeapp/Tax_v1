"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const digits = (s: string) => (s || "").replace(/\D/g, "");
const normalizeUSPhone = (raw: string) => {
  let d = digits(raw);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : d; // store digits-only (10 when valid)
};
const formatUSPhoneDisplay = (raw: string) => {
  const d = digits(raw).slice(0, 10);
  const p1 = d.slice(0,3), p2 = d.slice(3,6), p3 = d.slice(6,10);
  if (d.length <= 3) return p1;
  if (d.length <= 6) return `(${p1}) ${p2}`;
  return `(${p1}) ${p2}-${p3}`;
};

type Props = {
  firmId: string;
  onCreated?: () => void; // call to refresh list
};

export default function NewClientDialog({ firmId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!first.trim() || !last.trim()) {
      alert("First and last name are required.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("clients").insert({
      firm_id: firmId,
      first_name: first.trim(),
      last_name: last.trim(),
      email: email.trim() || null,
      phone: normalizeUSPhone(phone) || null, // store digits only
    });
    setSubmitting(false);
    if (error) {
      console.error(error);
      alert("Could not create client.");
      return;
    }
    setOpen(false);
    setFirst(""); setLast(""); setEmail(""); setPhone("");
    onCreated?.();
    alert("Client created.");
  };

  return (
    <>
      <button
        className="rounded-xl border px-3 py-2 hover:bg-muted"
        onClick={() => setOpen(true)}
      >
        + New Client
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
          <div className="w-[420px] rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 text-lg font-semibold">New Client</div>
            <div className="space-y-3">
              <input className="w-full rounded border p-2"
                placeholder="First name *" value={first} onChange={e=>setFirst(e.target.value)} />
              <input className="w-full rounded border p-2"
                placeholder="Last name *" value={last} onChange={e=>setLast(e.target.value)} />
              <input className="w-full rounded border p-2"
                placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="w-full rounded border p-2"
                placeholder="(555) 555-5555"
                value={formatUSPhoneDisplay(phone)}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border px-3 py-2" onClick={()=>setOpen(false)} disabled={submitting}>Cancel</button>
              <button className="rounded-xl bg-black px-3 py-2 text-white disabled:opacity-50"
                onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
