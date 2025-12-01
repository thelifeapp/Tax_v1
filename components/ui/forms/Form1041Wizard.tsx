"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import type { AudienceMode, FormField1041 } from "@/types/forms";
import { FieldRenderer } from "@/components/ui/forms/FieldRenderer";

type Form1041WizardProps = {
  audience: AudienceMode; // 'lawyer' or 'client'
  fields: FormField1041[];
  initialAnswers?: Record<string, any>;
  onSubmit?: (answers: Record<string, any>) => Promise<void> | void;
  filingId: string;
};

type SectionGroup = {
  name: string;
  fields: FormField1041[];
};

const SECTION_ORDER = [
  "Header",
  "Income",
  "Deductions",
  "Tax & Payments",
  "Schedule A",
  "Schedule B",
  "Schedule G Part I",
  "Schedule G Part II",
  "Other Information",
  "Preparer",
];

// ---------------------------
// Calculation helpers
// ---------------------------

function parseNumber(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const n = Number(String(val).replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function evaluateCalculation(
  expr: string,
  answers: Record<string, any>
): number | null {
  if (!expr) return null;

  const tokens = expr
    .split(/([+\-])/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  let result = 0;
  let sign = 1;

  for (const token of tokens) {
    if (token === "+") {
      sign = 1;
      continue;
    }
    if (token === "-") {
      sign = -1;
      continue;
    }

    const asNum = Number(token);
    let value: number;
    if (!Number.isNaN(asNum)) {
      value = asNum;
    } else {
      const v = answers[token];
      value = parseNumber(v);
    }

    result += sign * value;
  }

  return result;
}

function recomputeCalculatedFields(
  current: Record<string, any>,
  fields: FormField1041[]
): Record<string, any> {
  let changed = false;
  const next: Record<string, any> = { ...current };

  for (const f of fields) {
    if (!f.is_calculated || !f.calculation) continue;

    const val = evaluateCalculation(f.calculation, next);
    if (val === null) continue;

    if (next[f.field_key] !== val) {
      next[f.field_key] = val;
      changed = true;
    }
  }

  return changed ? next : current;
}

function countAnswered(answers: Record<string, any>, fields: FormField1041[]) {
  let answered = 0;

  for (const f of fields) {
    if (f.is_calculated) continue; // don’t count auto-calculated

    const v = answers[f.field_key];

    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;

    answered++;
  }

  return answered;
}

// ---------------------------
// Wizard component
// ---------------------------

export function Form1041Wizard({
  audience,
  fields,
  initialAnswers = {},
  onSubmit,
  filingId,
}: Form1041WizardProps) {
  const [answers, setAnswers] = useState<Record<string, any>>(
    recomputeCalculatedFields(initialAnswers, fields)
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For “Progress saved.” banner + unsaved-changes detection
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<Record<
    string,
    any
  >>(initialAnswers);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");

  useEffect(() => {
    // if initialAnswers change (new filing etc.), reset
    setAnswers(recomputeCalculatedFields(initialAnswers, fields));
    setLastSavedSnapshot(initialAnswers);
  }, [initialAnswers, fields]);

  const hasUnsavedChanges = useMemo(() => {
    try {
      return (
        JSON.stringify(answers) !== JSON.stringify(lastSavedSnapshot)
      );
    } catch {
      return true;
    }
  }, [answers, lastSavedSnapshot]);

  // Auto-hide “Progress saved.” after 4s
  useEffect(() => {
    if (saveStatus !== "saved" && saveStatus !== "error") return;
    const timer = setTimeout(() => {
      setSaveStatus("idle");
      setSaveMessage("");
    }, 4000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // Filter by audience + group by section
  const sections: SectionGroup[] = useMemo(() => {
    const filtered = fields
      .filter((f) => f.form_code === "1041")
      .filter((f) => {
        const aud = (f.audience || "both").toLowerCase();

        // PRO VIEW (lawyer): see all fields
        if (audience === "lawyer") return true;

        // Client view: only client + both
        if (audience === "client") {
          return aud === "client" || aud === "both";
        }

        return true;
      });

    const bySection = new Map<string, FormField1041[]>();

    for (const f of filtered) {
      const section = f.section || "Other";
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section)!.push(f);
    }

    const groups: SectionGroup[] = [];

    for (const section of SECTION_ORDER) {
      if (bySection.has(section)) {
        const list = bySection
          .get(section)!
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        groups.push({ name: section, fields: list });
        bySection.delete(section);
      }
    }

    for (const [section, list] of bySection.entries()) {
      groups.push({
        name: section,
        fields: list.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      });
    }

    return groups;
  }, [fields, audience]);

  const totalSteps = sections.length;
  const step = sections[currentStep];

  const totalFields = sections.reduce(
    (acc, s) => acc + s.fields.length,
    0
  );
  const answeredCount = countAnswered(answers, fields);
  const overallProgress =
    totalFields > 0
      ? Math.round((answeredCount / totalFields) * 100)
      : 0;

  const handleChange = (fieldKey: string, val: any) => {
    setAnswers((prev) => {
      const updated = { ...prev, [fieldKey]: val };
      return recomputeCalculatedFields(updated, fields);
    });
  };

  // Validate ALL fields (used only on final submit)
  const validateAll = (): string | null => {
    const missingRequired: string[] = [];

    for (const s of sections) {
      for (const f of s.fields) {
        if (!f.required) continue;
        if (f.is_calculated) continue;

        const inputType = (f.input_type || "").toLowerCase();
        const v = answers[f.field_key];

        // Single checkbox: allowed to remain unchecked
        if (inputType.includes("checkbox") && inputType.includes("single")) {
          continue;
        }

        // Multi-select required: at least one
        if (inputType.includes("checkbox") && inputType.includes("multi")) {
          if (!Array.isArray(v) || v.length === 0) {
            missingRequired.push(f.label);
          }
          continue;
        }

        if (v === undefined || v === null || v === "") {
          missingRequired.push(f.label);
        }
      }
    }

    if (missingRequired.length > 0) {
      return `Please fill required fields: ${missingRequired.join(", ")}`;
    }

    return null;
  };

  const performSave = useCallback(
    async (showToast = true) => {
      if (!onSubmit) return;

      try {
        setSaving(true);
        if (showToast) {
          setSaveStatus("saving");
          setSaveMessage("Saving progress…");
        }
        await onSubmit(answers);
        setLastSavedSnapshot(answers);
        if (showToast) {
          setSaveStatus("saved");
          setSaveMessage("Progress saved.");
        }
      } catch (err: any) {
        console.error("[Form1041Wizard] save error", err);
        if (showToast) {
          setSaveStatus("error");
          setSaveMessage(
            err?.message || "There was a problem saving your progress."
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [answers, onSubmit]
  );

  const goNext = async () => {
    // Only enforce required + final save when finishing
    if (currentStep === totalSteps - 1) {
      const validationError = validateAll();
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);

      if (onSubmit) {
        await performSave(false);
      }
    } else {
      setError(null);
      setCurrentStep((s) => s + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setError(null);
    }
  };

  const handleTabClick = (index: number) => {
    setCurrentStep(index);
    // also clear any error banner when switching sections
    setError(null);
  };

  const handleClose = async () => {
    if (hasUnsavedChanges) {
      const ok = window.confirm(
        "You have unsaved changes. Would you like to save before leaving?"
      );
      if (ok) {
        await performSave();
      }
    }
    // back to dashboard
    window.location.href = "/dashboard";
  };

  if (sections.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No 1041 fields configured for this template.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top floating save banner */}
      {saveStatus !== "idle" && saveMessage && (
        <div
          className={`fixed left-1/2 top-4 z-20 -translate-x-1/2 transform rounded-full border px-4 py-2 text-xs shadow ${
            saveStatus === "saved"
              ? "border-green-200 bg-green-50 text-green-700"
              : saveStatus === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-gray-200 bg-white text-gray-600"
          }`}
        >
          {saveMessage}
        </div>
      )}

      {/* Overall progress + Save / Close */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 text-xs text-gray-500">
          <div>
            <div className="flex items-center gap-2">
              <span>Form 1041 progress</span>
            </div>
            <div className="mt-0.5 text-[11px] text-gray-400">
              {overallProgress}% complete · {answeredCount} of {totalFields}{" "}
              questions answered
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => performSave()}
              disabled={saving || !onSubmit}
              className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save progress"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-xs text-gray-500 hover:bg-gray-50"
              aria-label="Back to dashboard"
            >
              ×
            </button>
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Tabs (file-tab style, no scrollbar, wraps if needed) */}
      <div className="border-b border-gray-200 pb-1">
        <div className="flex flex-wrap gap-1 text-xs">
          {sections.map((s, idx) => {
            const isActive = idx === currentStep;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => handleTabClick(idx)}
                className={[
                  "rounded-t-md px-3 py-1",
                  "border",
                  isActive
                    ? "border-gray-300 border-b-white bg-white text-gray-900"
                    : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100",
                ].join(" ")}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {step.name}
          </h2>
          <p className="text-xs text-gray-500">
            Step {currentStep + 1} of {totalSteps}
          </p>
        </div>
        <div className="text-xs text-gray-400">
          Fields with <span className="text-gray-400">*</span> are required
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {step.fields.map((field) => (
          <div
            key={field.id}
            className="rounded-md border border-gray-100 bg-white p-3"
          >
            <FieldRenderer
              field={field}
              value={answers[field.field_key]}
              onChange={handleChange}
              filingId={filingId}
            />
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={goBack}
          disabled={currentStep === 0}
          className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {currentStep === totalSteps - 1
            ? saving
              ? "Saving…"
              : "Finish"
            : "Next"}
        </button>
      </div>
    </div>
  );
}
