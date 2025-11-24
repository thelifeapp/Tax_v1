// components/ui/NewFilingDialog.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NewFilingDialogProps {
  clientId: string;
  clientEmail?: string | null;
  clientName?: string; // optional; can be used later for display, etc.
  onCreated?: () => void;
}

type IntakeMode = "client" | "lawyer";

const FORM_CODES = ["1041", "706", "709"] as const;
type FormCode = (typeof FORM_CODES)[number];

export function NewFilingDialog(props: NewFilingDialogProps) {
  const { clientId, clientEmail, onCreated } = props;
  // NOTE: we accept clientName via props but don't currently use it.
  // Keeping it off the destructuring avoids an unused variable warning.

  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // original behavior: multiple forms via checkboxes
  const [selectedForms, setSelectedForms] = useState<FormCode[]>(["1041"]);
  const [taxYear, setTaxYear] = useState<number>(new Date().getFullYear());
  const [status, setStatus] = useState<string>("draft");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("lawyer"); // default CPA/Lawyer

  function toggleForm(code: FormCode) {
    setSelectedForms((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  async function handleCreate() {
    try {
      setIsSubmitting(true);

      if (selectedForms.length === 0) {
        alert("Please select at least one form.");
        setIsSubmitting(false);
        return;
      }

      // 1. Call your existing /api/filings endpoint with the
      //    same shape it had before we added intakeMode.
      const res = await fetch("/api/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          taxYear,
          status,
          forms: selectedForms, // <= original API contract
          // NOTE: we intentionally DO NOT send intakeMode here
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Create filing error:", text);
        throw new Error("Failed to create filing");
      }

      const data = await res.json();

      // Some implementations return one filing, some an array – handle both.
      const createdFilings = Array.isArray(data) ? data : [data];

      // Find the 1041 filing (if any)
      const filing1041 =
        createdFilings.find(
          (f: any) =>
            f.filing_type === "1041" ||
            f.filingType === "1041" ||
            f.form_code === "1041"
        ) ?? createdFilings[0];

      const has1041 = createdFilings.some(
        (f: any) =>
          f.filing_type === "1041" ||
          f.filingType === "1041" ||
          f.form_code === "1041"
      );

      // 2. Lawyer mode + 1041 → go straight into the intake flow
      if (intakeMode === "lawyer" && has1041 && filing1041?.id) {
        setOpen(false);
        router.push(`/filings/${filing1041.id}/intake`);
        return;
      }

      // 3. Client mode + 1041 → create invite + copy link
      if (intakeMode === "client" && has1041 && filing1041?.id) {
        try {
          const inviteRes = await fetch("/api/intake/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filingId: filing1041.id,
              email: clientEmail ?? null,
            }),
          });

          if (!inviteRes.ok) {
            console.error("Invite error:", await inviteRes.text());
            throw new Error("Failed to create client invite");
          }

          const { link } = await inviteRes.json();

          if (link) {
            await navigator.clipboard.writeText(link);
            alert("Client intake link copied to your clipboard.");
          } else {
            alert("Client invite created, but no link was returned.");
          }
        } catch (e) {
          console.error(e);
          alert(
            "Filing was created, but there was an issue creating the client invite."
          );
        }
      }

      // 4. Close dialog, refresh dashboard list, and notify parent
      setOpen(false);
      router.refresh();
      if (onCreated) {
        onCreated();
      }
    } catch (error) {
      console.error(error);
      alert("Error creating filing. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + Filing
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-[#f2f2f2] border border-neutral-300 text-foreground">
          <DialogHeader>
            <DialogTitle>New Filing</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Form(s) checkboxes */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Form(s)</label>
              <div className="flex gap-4 text-sm mt-1">
                {FORM_CODES.map((code) => (
                  <label key={code} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selectedForms.includes(code)}
                      onChange={() => toggleForm(code)}
                    />
                    <span>{code}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Tax year */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Tax year</label>
              <Input
                type="number"
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
              />
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Initial status</label>
              <select
                className="w-full border rounded-md px-2 py-1 text-sm bg-white"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="in_progress">In progress</option>
              </select>
            </div>

            {/* Intake mode */}
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Who will fill out the questionnaire?
              </label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIntakeMode("lawyer")}
                  className={`flex-1 rounded-full border px-3 py-2 text-sm ${
                    intakeMode === "lawyer" ? "bg-black text-white" : "bg-white"
                  }`}
                >
                  CPA or Lawyer
                </button>
                <button
                  type="button"
                  onClick={() => setIntakeMode("client")}
                  className={`flex-1 rounded-full border px-3 py-2 text-sm ${
                    intakeMode === "client" ? "bg-black text-white" : "bg-white"
                  }`}
                >
                  Client
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create filing"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default NewFilingDialog;
