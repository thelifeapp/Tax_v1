// components/ui/intake/IntakeQuestionFlow.tsx

"use client";

import { useMemo, useState } from "react";
import debounce from "lodash.debounce";
import type { FormField, FormAnswer, AudienceMode } from "@/types/forms";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type AnswerMap = Record<string, any>;

interface IntakeQuestionFlowProps {
  filingId: string;
  formCode: string; // "1041"
  mode: AudienceMode; // "client" | "lawyer"
  fields: FormField[];
  answers: FormAnswer[];
  showSubmitForReview?: boolean;
  onSubmitForReview?: () => Promise<void>;
}

const IntakeQuestionFlow = (props: IntakeQuestionFlowProps) => {
  const {
    filingId,
    formCode,
    mode,
    fields,
    answers,
    showSubmitForReview,
    onSubmitForReview,
  } = props;

  const [answerMap, setAnswerMap] = useState<AnswerMap>(() => {
    const map: AnswerMap = {};
    answers.forEach((a) => {
      map[a.field_key] = a.value;
    });
    return map;
  });

  const [saving, setSaving] = useState(false);

  // ----- Progress calculation -----
  const requiredKeys = useMemo(
    () => fields.filter((f) => f.required).map((f) => f.field_key),
    [fields]
  );

  const answeredRequiredCount = useMemo(
    () =>
      requiredKeys.filter((key) => {
        const v = answerMap[key];
        if (v === null || v === undefined) return false;
        if (typeof v === "string") return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        return true;
      }).length,
    [requiredKeys, answerMap]
  );

  const progress =
    requiredKeys.length === 0
      ? 0
      : Math.round((answeredRequiredCount / requiredKeys.length) * 100);

  // ----- Group fields into sections -----
  const sections = useMemo(() => {
    const bySection: Record<string, FormField[]> = {};
    fields.forEach((f) => {
      const key = f.section || "Other";
      if (!bySection[key]) bySection[key] = [];
      bySection[key].push(f);
    });

    Object.values(bySection).forEach((arr) =>
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    );

    return bySection;
  }, [fields]);

  const sectionNames = Object.keys(sections);

  // ----- Autosave handler -----
  const autosave = useMemo(
    () =>
      debounce(async (fieldKey: string, value: any) => {
        setSaving(true);
        try {
          await fetch("/api/intake/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filingId,
              formCode,
              fieldKey,
              value,
              mode,
            }),
          });
        } catch (e) {
          console.error("autosave error", e);
        } finally {
          setSaving(false);
        }
      }, 700),
    [filingId, formCode, mode]
  );

  function handleChange(fieldKey: string, value: any) {
    setAnswerMap((prev) => ({ ...prev, [fieldKey]: value }));
    autosave(fieldKey, value);
  }

  return (
    <div className="max-w-3xl mx-auto pb-24 flex flex-col gap-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b pb-3 pt-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {formCode} Intake · {mode === "client" ? "Client" : "Professional"} view
            </p>
            <p className="text-sm mt-1">
              Answer the questions below as best you can. Your answers save automatically.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {answeredRequiredCount} / {requiredKeys.length} required
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Progress value={progress} className="w-24" />
              <span className="text-xs text-muted-foreground">{progress}%</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {saving ? "Saving..." : "Saved"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {sectionNames.map((name) => (
            <a
              key={name}
              href={`#section-${name}`}
              className="text-xs px-2 py-1 rounded-full border hover:bg-muted"
            >
              {name}
            </a>
          ))}
        </div>
      </div>

      {/* Sections */}
      {sectionNames.map((name) => (
        <div key={name} id={`section-${name}`} className="mt-4">
          <h2 className="text-sm font-semibold mb-2">{name}</h2>
          <div className="space-y-3">
            {sections[name].map((field) => (
              <QuestionCard
                key={field.field_key}
                field={field}
                value={answerMap[field.field_key]}
                onChange={(v) => handleChange(field.field_key, v)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Footer submit for client */}
      {mode === "client" && showSubmitForReview && onSubmitForReview && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              When you’re done, submit your answers to your CPA / lawyer for review.
            </p>
            <Button size="sm" onClick={() => onSubmitForReview()}>
              Submit for review
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

interface QuestionCardProps {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
}

function QuestionCard({ field, value, onChange }: QuestionCardProps) {
  const isRequired = field.required;

  const renderInput = () => {
    switch (field.type) {
      case "number":
      case "currency":
        return (
          <Input
            type="number"
            value={value ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
          />
        );
      case "date":
        return (
          <Input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
          />
        );
      case "textarea":
        return (
          <Textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        );
      default:
        return (
          <Input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  return (
    <Card className="p-4 rounded-2xl border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{field.label}</p>
          {field.help_text && (
            <p className="mt-1 text-xs text-muted-foreground">
              {field.help_text}
            </p>
          )}
        </div>
        {isRequired && (
          <span className="text-[10px] uppercase text-rose-500 font-semibold">
            Required
          </span>
        )}
      </div>
      <div className="mt-3">{renderInput()}</div>
      {field.core_key && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Core field: {field.core_key}
        </p>
      )}
    </Card>
  );
}

export default IntakeQuestionFlow;
