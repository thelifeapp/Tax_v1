"use client";

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { AudienceMode, FormField1041 } from "@/types/forms";
import { FieldRenderer } from "@/components/ui/forms/FieldRenderer";

type Form1041WizardProps = {
  audience: AudienceMode; // "lawyer" | "client"
  fields: FormField1041[];
  initialAnswers?: Record<string, any>;
  onSubmit?: (answers: Record<string, any>) => Promise<void> | void;
  filingId: string;
};

const SECTION_LABELS: string[] = [
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
  "Signature",
];

function stableStringify(obj: any) {
  try {
    return JSON.stringify(obj ?? {});
  } catch {
    return String(Date.now());
  }
}

/** -----------------------------
 *  Calculations engine
 *  ----------------------------- */
function toNumber(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "boolean") return val ? 1 : 0;

  if (typeof val === "object") {
    if ("value" in val) return toNumber((val as any).value);
    if ("text" in val) return toNumber((val as any).text);
    if (Array.isArray(val)) return val.map(toNumber).reduce((a, b) => a + b, 0);
    return 0;
  }

  const s = String(val);
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractIdentifiers(expr: string): string[] {
  const raw = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const banned = new Set(["min", "max", "Math"]);
  return raw.filter((x) => !banned.has(x));
}

function evalExpression(expr: string, ctx: Record<string, number>): number {
  let jsExpr = expr;

  jsExpr = jsExpr.replace(/\bmin\s*\(/g, "Math.min(");
  jsExpr = jsExpr.replace(/\bmax\s*\(/g, "Math.max(");

  const ids = extractIdentifiers(expr);
  ids.sort((a, b) => b.length - a.length);

  for (const id of ids) {
    const re = new RegExp(`\\b${id}\\b`, "g");
    jsExpr = jsExpr.replace(re, `(__ctx["${id}"] ?? 0)`);
  }

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("__ctx", `return (${jsExpr});`);
    const out = fn(ctx);
    const num = Number(out);
    return Number.isFinite(num) ? num : 0;
  } catch {
    return 0;
  }
}

function computeCalculated(fields: FormField1041[], answers: Record<string, any>) {
  const calcFields = fields.filter(
    (f) => f.is_calculated === true && String(f.calculation ?? "").trim() !== ""
  );

  const ctx: Record<string, number> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    ctx[k] = toNumber(v);
  }

  const result: Record<string, any> = {};
  if (calcFields.length === 0) return result;

  const pending = new Set(calcFields.map((f) => f.field_key));
  const fieldByKey = new Map(calcFields.map((f) => [f.field_key, f]));

  for (let pass = 0; pass < calcFields.length + 5; pass++) {
    let progress = false;

    for (const key of Array.from(pending)) {
      const f = fieldByKey.get(key);
      if (!f) {
        pending.delete(key);
        continue;
      }

      const expr = String(f.calculation ?? "").trim();
      const valueNum = evalExpression(expr, ctx);

      ctx[key] = valueNum;
      result[key] = valueNum;

      pending.delete(key);
      progress = true;
    }

    if (!progress) break;
    if (pending.size === 0) break;
  }

  return result;
}

/** -----------------------------
 *  Search helpers
 *  ----------------------------- */
function normalizeSearch(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(q: string): string[] {
  const n = normalizeSearch(q);
  if (!n) return [];
  return n.split(" ").filter(Boolean);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlight tokens (case-insensitive) in a display string.
 * - Uses simple token matching (not normalized matching) to keep UI intuitive.
 * - Safe: returns plain React nodes (no dangerouslySetInnerHTML).
 */
function highlightText(display: string, queryTokens: string[]) {
  if (!display) return display;
  if (!queryTokens || queryTokens.length === 0) return display;

  const tokens = Array.from(new Set(queryTokens.map((t) => t.trim()).filter(Boolean)));
  if (tokens.length === 0) return display;

  const pattern = tokens.map(escapeRegExp).join("|");
  const re = new RegExp(`(${pattern})`, "ig");

  const parts = display.split(re);

  return parts.map((part, idx) => {
    const isHit = tokens.some((t) => part.toLowerCase() === t.toLowerCase());
    if (!isHit) return <React.Fragment key={idx}>{part}</React.Fragment>;

    return (
      <mark
        key={idx}
        className="rounded bg-yellow-100 px-1 py-0.5 text-gray-900"
      >
        {part}
      </mark>
    );
  });
}

export function Form1041Wizard(props: Form1041WizardProps) {
  const { audience, fields, initialAnswers = {}, onSubmit, filingId } = props;

  const initialSnapshotRef = useRef<string>(stableStringify(initialAnswers));
  const hasInitializedRef = useRef<boolean>(false);

  const [answers, setAnswers] = useState<Record<string, any>>(() => ({
    ...(initialAnswers ?? {}),
  }));

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>(() =>
    stableStringify(initialAnswers)
  );

  // ✅ “Progress saved” banner
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  // ✅ Left index / sidebar
  const [indexOpen, setIndexOpen] = useState(true);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [indexQuery, setIndexQuery] = useState("");

  useEffect(() => {
    const nextSnapshot = stableStringify(initialAnswers);

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      initialSnapshotRef.current = nextSnapshot;
      setAnswers({ ...(initialAnswers ?? {}) });
      setLastSavedSnapshot(nextSnapshot);
      return;
    }

    if (nextSnapshot !== initialSnapshotRef.current) {
      const localSnapshot = stableStringify(answers);
      const safeToReplace = localSnapshot === lastSavedSnapshot;

      if (safeToReplace) {
        initialSnapshotRef.current = nextSnapshot;
        setAnswers({ ...(initialAnswers ?? {}) });
        setLastSavedSnapshot(nextSnapshot);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filingId]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  const hasUnsavedChanges = useMemo(() => {
    return stableStringify(answers) !== lastSavedSnapshot;
  }, [answers, lastSavedSnapshot]);

  // Group fields into sections (stable order)
  const sections = useMemo(() => {
    const map = new Map<string, FormField1041[]>();
    for (const f of fields) {
      const s = (f.section ?? "Header").trim() || "Header";
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(f);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      map.set(k, arr);
    }

    const ordered: { name: string; fields: FormField1041[] }[] = [];
    for (const label of SECTION_LABELS) {
      if (map.has(label)) {
        ordered.push({ name: label, fields: map.get(label)! });
        map.delete(label);
      }
    }
    for (const [name, flds] of map.entries()) {
      ordered.push({ name, fields: flds });
    }

    return ordered;
  }, [fields]);

  // Default expand current section
  useEffect(() => {
    if (sections.length === 0) return;
    const current = sections[currentStep]?.name;
    if (!current) return;
    setOpenSections((prev) => ({ ...prev, [current]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, sections.length]);

  const updateAnswer = useCallback((fieldKey: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
  }, []);

  // ✅ compute calculated values live
  const calculatedAnswers = useMemo(() => {
    return computeCalculated(fields, answers);
  }, [fields, answers]);

  const derivedAnswers = useMemo(() => {
    return { ...(answers ?? {}), ...(calculatedAnswers ?? {}) };
  }, [answers, calculatedAnswers]);

  const triggerSavedBanner = useCallback(() => {
    setShowSavedBanner(true);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => {
      setShowSavedBanner(false);
    }, 4000);
  }, []);

  const performSave = useCallback(async () => {
    if (!onSubmit) return;

    setSaving(true);
    setError(null);

    try {
      const payloadToSave = {
        ...(answers ?? {}),
        ...(computeCalculated(fields, answers) ?? {}),
      };

      await onSubmit(payloadToSave);

      setLastSavedSnapshot(stableStringify(answers));
      triggerSavedBanner();
    } catch (e) {
      console.error(e);
      setError("Could not save. Please try again.");
      throw e;
    } finally {
      setSaving(false);
    }
  }, [answers, fields, onSubmit, triggerSavedBanner]);

  const handleTabClick = (index: number) => {
    setCurrentStep(index);
    setError(null);
  };

  const handleClose = async () => {
    if (hasUnsavedChanges) {
      const ok = window.confirm(
        "You have unsaved changes. Would you like to save before leaving?"
      );
      if (ok) {
        try {
          await performSave();
        } catch {
          // allow leave anyway
        }
      }
    }
    window.location.href = "/dashboard";
  };

  const handleDownload = useCallback(() => {
    window.location.href = `/api/filings/${filingId}/1041/pdf`;
  }, [filingId]);

  const scrollToField = useCallback((fieldKey: string) => {
    window.setTimeout(() => {
      const el = document.getElementById(`field-${fieldKey}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const handleIndexClick = useCallback(
    (sectionIndex: number, fieldKey: string) => {
      setCurrentStep(sectionIndex);
      setError(null);
      setOpenSections((prev) => ({
        ...prev,
        [sections[sectionIndex]?.name ?? ""]: true,
      }));
      scrollToField(fieldKey);
    },
    [scrollToField, sections]
  );

  const normalizedQuery = useMemo(() => normalizeSearch(indexQuery), [indexQuery]);
  const queryTokens = useMemo(() => tokenizeQuery(indexQuery), [indexQuery]);
  const hasQuery = normalizedQuery.length > 0;

  // Filtered view of sections/fields for index search
  const filteredIndexSections = useMemo(() => {
    if (!hasQuery) return sections;

    const out: { name: string; fields: FormField1041[] }[] = [];
    for (const sec of sections) {
      const filteredFields = sec.fields.filter((f) => {
        const hay = normalizeSearch(
          `${sec.name} ${f.label ?? ""} ${f.line_it ?? ""} ${f.field_key ?? ""}`
        );
        return hay.includes(normalizedQuery);
      });
      if (filteredFields.length > 0) {
        out.push({ name: sec.name, fields: filteredFields });
      }
    }
    return out;
  }, [sections, hasQuery, normalizedQuery]);

  // Auto-expand sections when searching so results are visible
  useEffect(() => {
    if (!hasQuery) return;
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const s of filteredIndexSections) next[s.name] = true;
      return next;
    });
  }, [hasQuery, filteredIndexSections]);

  if (sections.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No 1041 fields configured for this template.
      </div>
    );
  }

  const isLastStep = currentStep >= sections.length - 1;
  const currentSection = sections[currentStep];

  const totalSteps = sections.length;
  const stepNumber = Math.min(currentStep + 1, totalSteps);
  const pctTabs = totalSteps > 0 ? Math.round((stepNumber / totalSteps) * 100) : 0;

  const handleNextOrFinish = async () => {
    setError(null);

    if (!isLastStep) {
      setCurrentStep((s) => Math.min(s + 1, sections.length - 1));
      return;
    }

    try {
      if (onSubmit) await performSave();
    } catch {
      return;
    }

    window.location.href = `/filings/${filingId}/print`;
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setError(null);
    }
  };

  return (
    <div className="flex gap-6">
      {/* LEFT INDEX */}
      <div className={`shrink-0 ${indexOpen ? "w-72" : "w-12"}`}>
        <div className="sticky top-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-3 py-2">
              <div className={`text-sm font-medium text-gray-900 ${indexOpen ? "" : "hidden"}`}>
                Index
              </div>
              <button
                type="button"
                onClick={() => setIndexOpen((v) => !v)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50"
                title={indexOpen ? "Collapse index" : "Expand index"}
                aria-label="Toggle index"
              >
                {indexOpen ? "⟨" : "⟩"}
              </button>
            </div>

            {indexOpen && (
              <div className="max-h-[78vh] overflow-auto border-t border-gray-100 p-2">
                {/* Search */}
                <div className="mb-2 px-1">
                  <input
                    value={indexQuery}
                    onChange={(e) => setIndexQuery(e.target.value)}
                    placeholder='Search lines (e.g., "interest income")'
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  {hasQuery && (
                    <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                      <span>
                        Showing matches for: <span className="font-medium">{indexQuery}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIndexQuery("")}
                        className="text-blue-600 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {/* Sections */}
                {filteredIndexSections.length === 0 ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                    No matches found.
                  </div>
                ) : (
                  filteredIndexSections.map((sec) => {
                    const secIdx = sections.findIndex((s) => s.name === sec.name);
                    const isOpen = openSections[sec.name] ?? (secIdx === currentStep);

                    return (
                      <div key={sec.name} className="mb-2">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenSections((prev) => ({ ...prev, [sec.name]: !isOpen }))
                          }
                          className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${
                            secIdx === currentStep
                              ? "bg-blue-50 text-blue-800"
                              : "hover:bg-gray-50 text-gray-800"
                          }`}
                          title={sec.name}
                        >
                          <span className="truncate">
                            {hasQuery ? highlightText(sec.name, queryTokens) : sec.name}
                          </span>
                          <span className="ml-2 text-xs text-gray-400">{isOpen ? "–" : "+"}</span>
                        </button>

                        {isOpen && (
                          <div className="mt-1 space-y-1 pl-2">
                            {sec.fields.map((f) => {
                              const labelText = String(f.label ?? "");
                              const lineText = f.line_it ? `Line ${f.line_it}` : "";

                              return (
                                <button
                                  key={f.field_key}
                                  type="button"
                                  onClick={() => handleIndexClick(secIdx, f.field_key)}
                                  className="group w-full rounded-md px-2 py-1 text-left text-xs text-gray-600 hover:bg-gray-50"
                                  title={labelText}
                                >
                                  <div className="flex items-start gap-2">
                                    {f.line_it ? (
                                      <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">
                                        {hasQuery ? highlightText(String(f.line_it), queryTokens) : f.line_it}
                                      </span>
                                    ) : (
                                      <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">
                                        •
                                      </span>
                                    )}

                                    <span className="line-clamp-2 text-gray-700 group-hover:text-gray-900">
                                      {hasQuery ? highlightText(labelText, queryTokens) : labelText}
                                      {lineText ? (
                                        <span className="ml-1 text-gray-400">
                                          {" "}
                                          ({hasQuery ? highlightText(lineText, queryTokens) : lineText})
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* Saved banner */}
        {showSavedBanner && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
            ✅ Progress saved
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm text-gray-500">Form 1041 progress</div>
            <div className="text-sm text-gray-500">
              {pctTabs}% complete · Step {stepNumber} of {totalSteps}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => performSave()}
              disabled={saving || !onSubmit}
              className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save progress"}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-xs text-gray-500 hover:bg-gray-50"
              aria-label="Download 1041 PDF"
              title="Download 1041 PDF"
            >
              ↓
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-xs text-gray-500 hover:bg-gray-50"
              aria-label="Back to dashboard"
              title="Back to dashboard"
            >
              ×
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-blue-500" style={{ width: `${pctTabs}%` }} />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {sections.map((s, idx) => {
            const active = idx === currentStep;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => handleTabClick(idx)}
                className={`rounded-md px-3 py-1 text-sm ${
                  active
                    ? "border border-blue-500 bg-white text-gray-900"
                    : "border border-gray-200 bg-white text-gray-500 hover:text-gray-700"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>

        {/* Error banner */}
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Section header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-2xl font-semibold text-gray-900">{currentSection.name}</div>
            <div className="text-sm text-gray-500">
              Step {stepNumber} of {totalSteps}
            </div>
          </div>
          <div className="text-sm text-gray-400">Fields with * are required</div>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {currentSection.fields.map((f) => (
            <div key={f.field_key} id={`field-${f.field_key}`} className="scroll-mt-24">
              <FieldRenderer
                field={f}
                audience={audience}
                filingId={filingId}
                allAnswers={derivedAnswers}
                value={derivedAnswers[f.field_key] ?? ""}
                onChange={(val) => updateAnswer(f.field_key, val)}
              />
            </div>
          ))}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>

          <button
            type="button"
            onClick={handleNextOrFinish}
            className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLastStep ? "Print Preview" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Form1041Wizard;
