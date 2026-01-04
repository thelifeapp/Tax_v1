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

export function NewFilingDialog(props: NewFilingDialogProps) {
  const { clientId, clientEmail, onCreated } = props;

  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // LOCKED for now (MVP)
  const FIXED_FORM = "1041";
  const FIXED_TAX_YEAR = 2024;

  const [status, setStatus] = useState<string>("in_progress");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("lawyer"); // default CPA/Lawyer
  const [ptin, setPtin] = useState<string>("");

  async function handleCreate() {
    try {
      setIsSubmitting(true);

      // Create the filing (locked to 1041 + 2024)
      const res = await fetch("/api/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          taxYear: FIXED_TAX_YEAR,
          status,
          forms: [FIXED_FORM],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Create filing error:", text);
        throw new Error("Failed to create filing");
      }

      const data = await res.json();
      const createdFilings = Array.isArray(data) ? data : [data];

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

      const ptinTrim = ptin.trim();
      const qs = ptinTrim ? `?ptin=${encodeURIComponent(ptinTrim)}` : "";

      // Lawyer mode + 1041 → go straight into intake
      if (intakeMode === "lawyer" && has1041 && filing1041?.id) {
        setOpen(false);
        router.push(`/filings/${filing1041.id}/intake${qs}`);
        return;
      }

      // Client mode + 1041 → create invite + copy link (append PTIN if provided)
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
            const linkWithPtin = ptinTrim
              ? `${link}${link.includes("?") ? "&" : "?"}ptin=${encodeURIComponent(
                  ptinTrim
                )}`
              : link;

            await navigator.clipboard.writeText(linkWithPtin);
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

      // Close dialog, refresh dashboard list, and notify parent
      setOpen(false);
      router.refresh();
      onCreated?.();
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
            {/* Locked Form */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Form</label>
              <div className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked readOnly />
                <span>{FIXED_FORM}</span>
                <span className="text-xs text-gray-500">(706 and 709 coming soon)</span>
              </div>
            </div>

            {/* Locked Tax year */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Tax year</label>
              <Input type="number" value={FIXED_TAX_YEAR} disabled />
              <div className="text-xs text-gray-500">(only supported year)</div>
            </div>

            {/* PTIN */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Preparer PTIN</label>
              <Input
                value={ptin}
                onChange={(e) => setPtin(e.target.value)}
                placeholder="Enter PTIN (optional)"
              />
              <div className="text-xs text-gray-500">
                We’ll auto-fill this into the Preparer section.
              </div>
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
