"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  clientId: string;
  clientName: string;
  onCreated?: (created: number, skipped: string[]) => void;
};

const ALL_FORMS = ["1041","706","709"] as const;
type FormCode = typeof ALL_FORMS[number];

export default function NewFilingDialog({ clientId, clientName, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<FormCode[]>([]);
  const [year, setYear] = useState<number | "">("");
  const [status, setStatus] = useState("in_progress");
  const [submitting, setSubmitting] = useState(false);

  const currentYear = useMemo(()=> new Date().getFullYear(), []);
  const validYear = typeof year === "number" && year >= 2000 && year <= currentYear + 1;

  const toggleForm = (code: FormCode) => {
    setForms(prev => prev.includes(code) ? prev.filter(f=>f!==code) : [...prev, code]);
  };

  const submit = async () => {
    if (!forms.length) return alert("Select at least one form.");
    if (!validYear) return alert(`Enter a valid tax year (2000–${currentYear+1}).`);

    setSubmitting(true);
    let created = 0;
    const skipped: string[] = [];

    for (const code of forms) {
      const { error } = await supabase.from("filings").insert({
        client_id: clientId,
        filing_type: code,
        tax_year: year,
        status
      });
      if (error) {
        // duplicate or other constraint -> collect as skipped
        skipped.push(`${code}/${year}`);
      } else {
        created += 1;
      }
    }

    setSubmitting(false);
    setOpen(false);
    onCreated?.(created, skipped);
    setForms([]); setYear(""); setStatus("in_progress");

    if (created) alert(`${created} filing(s) created for ${clientName}.`);
    if (skipped.length) alert(`Skipped (already exists): ${skipped.join(", ")}`);
  };

  return (
    <>
      <button className="rounded-xl border px-2 py-1 text-xs hover:bg-muted"
        onClick={()=>setOpen(true)}>
        + Filing
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
          <div className="w-[460px] rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 text-lg font-semibold">New Filing · {clientName}</div>

            <div className="space-y-4">
              <div>
                <div className="mb-1 text-sm font-medium">Form(s)</div>
                <div className="flex gap-3">
                  {ALL_FORMS.map(code => (
                    <label key={code} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={forms.includes(code)} onChange={()=>toggleForm(code)} />
                      {code}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">Tax year</div>
                <input className="w-40 rounded border p-2" type="number" placeholder={`${currentYear}`}
                  value={year} onChange={e=>setYear(e.target.value ? Number(e.target.value) : "")} />
                {!validYear && year !== "" && (
                  <div className="mt-1 text-xs text-red-600">Enter a year 2000–{currentYear+1}.</div>
                )}
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">Initial status</div>
                <select className="rounded border p-2" value={status} onChange={e=>setStatus(e.target.value)}>
                  <option value="in_progress">in_progress</option>
                  <option value="ready_for_review">ready_for_review</option>
                  <option value="filed">filed</option>
                </select>
              </div>
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
