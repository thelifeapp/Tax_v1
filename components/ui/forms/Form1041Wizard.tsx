"use client";

import React, { useMemo, useState } from "react";
import type { AudienceMode, FormField1041 } from "@/types/forms";
import { FieldRenderer } from "@/components/ui/forms/FieldRenderer";

type Form1041WizardProps = {
  audience: AudienceMode; // 'lawyer' or 'client'
  fields: FormField1041[];
  initialAnswers?: Record<string, any>;
  onSubmit?: (answers: Record<string, any>) => Promise<void> | void;
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

// ---------------------------
// Wizard component
// ---------------------------

export function Form1041Wizard({
  audience,
  fields,
  initialAnswers = {},
  onSubmit,
}: Form1041WizardProps) {
  const [answers, setAnswers] = useState<Record<string, any>>(
    recomputeCalculatedFields(initialAnswers, fields)
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const completedCount = sections
    .slice(0, currentStep)
    .reduce((acc, s) => acc + s.fields.length, 0);
  const totalFields = sections.reduce((acc, s) => acc + s.fields.length, 0);
  const overallProgress =
    totalFields > 0 ? Math.round((completedCount / totalFields) * 100) : 0;

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

  const goNext = async () => {
    // Only enforce required when finishing
    if (currentStep === totalSteps - 1) {
      const validationError = validateAll();
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);

      if (onSubmit) {
        try {
          setSaving(true);
          await onSubmit(answers);
        } catch (err: any) {
          setError(err?.message || "Error saving form");
        } finally {
          setSaving(false);
        }
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

  if (sections.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No 1041 fields configured for this template.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Form 1041 progress</span>
          <span>{overallProgress}% complete</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Step header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{step.name}</h2>
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
