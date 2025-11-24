"use client";

import React, { useEffect, useRef, useState } from "react";
import type { FormField1041 } from "@/types/forms";

type FieldRendererProps = {
  field: FormField1041;
  value: any;
  onChange: (fieldKey: string, val: any) => void;
};

/**
 * Normalize input_type + type into a small set of UI control kinds.
 */
type InputKind =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "checkbox_single"
  | "multi_select"
  | "select"
  | "attachment";

function resolveInputKind(field: FormField1041): InputKind {
  const rawInput = (field.input_type || "").toLowerCase().trim();
  const rawType = (field.type || "").toLowerCase().trim();

  if (rawInput.includes("checkbox") && rawInput.includes("multi")) {
    return "multi_select";
  }

  if (rawInput.includes("checkbox")) {
    return "checkbox_single";
  }

  if (rawInput === "yes;no") {
    return "select";
  }

  if (rawInput.includes("date")) {
    return "date";
  }

  if (rawInput.includes("currency")) {
    return "currency";
  }

  if (rawInput.includes("number")) {
    return "number";
  }

  if (
    rawInput.includes("attachment") ||
    rawInput.includes("attach") ||
    rawInput.includes("signature")
  ) {
    return "attachment";
  }

  if (rawType === "date") return "date";
  if (rawType === "number") return "number";

  return "text";
}

function formatCurrency(val: any): string {
  if (val === null || val === undefined || val === "") return "";
  const num =
    typeof val === "number"
      ? val
      : Number(String(val).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function getPlaceholder(field: FormField1041): string | undefined {
  const key = (field.field_key || "").toLowerCase();
  const label = (field.label || "").toLowerCase();

  if (key.includes("ein") || label.includes("ein")) {
    return "XX-XXXXXXX";
  }

  return undefined;
}

function isAddressField(field: FormField1041): boolean {
  const key = (field.field_key || "").toLowerCase();
  const label = (field.label || "").toLowerCase();
  return (
    key.includes("street") ||
    key.includes("address") ||
    label.includes("street") ||
    label.includes("zip/postal")
  );
}

export function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const {
    field_key,
    label,
    help_text,
    required,
    is_calculated,
    calculation,
    source_notes,
    options,
  } = field;

  const kind = resolveInputKind(field);
  const disabled = is_calculated === true;
  const placeholder = getPlaceholder(field);
  const addressField = isAddressField(field);

  // Local display state for currency so we can format on blur
  const [currencyDisplay, setCurrencyDisplay] = useState(
    kind === "currency" ? formatCurrency(value) : ""
  );

  // Ref for address autocomplete
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  // Ref for attachment input (so we can style a fake button)
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!addressField || disabled) return;
    if (!addressInputRef.current) return;

    if (typeof window === "undefined") return;
    const anyWindow = window as any;
    const google = anyWindow.google;
    if (!google?.maps?.places) return;

    const autocomplete = new google.maps.places.Autocomplete(
      addressInputRef.current,
      { types: ["geocode"] }
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const formatted =
        place?.formatted_address || addressInputRef.current?.value || "";
      if (formatted) {
        onChange(field_key, formatted);
      }
    });

    return () => {
      if (google?.maps?.event && autocomplete) {
        google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, [addressField, disabled, field_key, onChange]);

  useEffect(() => {
    if (kind === "currency") {
      setCurrencyDisplay(formatCurrency(value));
    }
  }, [value, kind]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const target = e.target as HTMLInputElement;

    if (kind === "checkbox_single") {
      onChange(field_key, target.checked);
      return;
    }

    if (kind === "currency") {
      const raw = target.value;
      setCurrencyDisplay(raw);
      return;
    }

    if (kind === "number") {
      const raw = target.value;
      const num = raw === "" ? null : Number(raw);
      onChange(field_key, Number.isNaN(num) ? null : num);
      return;
    }

    if (kind === "attachment") {
      const files = Array.from(target.files || []);
      const fileNames = files.map((f) => f.name);
      onChange(field_key, fileNames);
      return;
    }

    onChange(field_key, target.value);
  };

  const handleCurrencyBlur = () => {
    const cleaned = currencyDisplay.replace(/[^0-9.-]/g, "");
    const num = cleaned === "" ? null : Number(cleaned);
    if (num === null || Number.isNaN(num)) {
      onChange(field_key, null);
      setCurrencyDisplay("");
      return;
    }
    onChange(field_key, num);
    setCurrencyDisplay(formatCurrency(num));
  };

  const renderInput = () => {
    // ---------------------------
    // Calculated fields: read-only
    // ---------------------------
    if (disabled) {
      const inputType =
        kind === "currency"
          ? "text"
          : kind === "number"
          ? "number"
          : kind === "date"
          ? "date"
          : "text";

      const displayValue =
        kind === "currency" ? formatCurrency(value) : value ?? "";

      return (
        <div className="flex items-start gap-2">
          <input
            type={inputType}
            value={displayValue}
            disabled
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
          />
          {(calculation || source_notes) && (
            <button
              type="button"
              className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs text-gray-500"
              title={`${calculation || ""}${
                calculation && source_notes ? " — " : ""
              }${source_notes || ""}`}
            >
              i
            </button>
          )}
        </div>
      );
    }

    // ---------------------------
    // Editable controls
    // ---------------------------

    if (kind === "date") {
      return (
        <input
          type="date"
          value={value ?? ""}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
      );
    }

    if (kind === "currency") {
      return (
        <input
          type="text"
          value={currencyDisplay}
          onChange={handleChange}
          onBlur={handleCurrencyBlur}
          placeholder={placeholder || "$0.00"}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-right"
        />
      );
    }

    if (kind === "number") {
      return (
        <input
          type="number"
          value={value ?? ""}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
      );
    }

    if (kind === "checkbox_single") {
      return (
        <div className="space-y-1 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!value}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span>Check if this applies</span>
          </div>
          <p className="text-xs text-gray-500">
            Leave blank if not applicable.
          </p>
        </div>
      );
    }

    if (kind === "select" && options && options.length > 0) {
      return (
        <select
          value={value ?? ""}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (kind === "multi_select" && options && options.length > 0) {
      const current: string[] = Array.isArray(value) ? value : [];

      const toggle = (opt: string) => {
        if (current.includes(opt)) {
          onChange(
            field_key,
            current.filter((v) => v !== opt)
          );
        } else {
          onChange(field_key, [...current, opt]);
        }
      };

      return (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`rounded-full border px-3 py-1 text-xs ${
                current.includes(opt)
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }

    if (kind === "attachment") {
      const fileNames: string[] = Array.isArray(value) ? value : [];

      return (
        <div className="space-y-2">
          {/* Hidden native input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleChange}
            className="hidden"
          />

          {/* Pretty button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            {fileNames.length > 0 ? "Add more files" : "Choose files"}
          </button>

          {fileNames.length === 0 ? (
            <p className="text-xs text-gray-400">No files attached yet.</p>
          ) : (
            <p className="text-xs text-gray-500">
              Attached: {fileNames.join(", ")}
            </p>
          )}
        </div>
      );
    }

    // Default text / address input
    return (
      <input
        ref={addressField ? addressInputRef : undefined}
        type="text"
        value={value ?? ""}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
    );
  };

  const addressMapsLink =
    addressField && typeof value === "string" && value.trim().length > 0 ? (
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          value
        )}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-xs text-blue-600 underline"
      >
        Search this address on Google Maps
      </a>
    ) : null;

  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between text-sm font-medium text-gray-800">
        <span>
          {label}
          {required && <span className="ml-1 text-xs text-gray-400">*</span>}
        </span>
      </label>
      {help_text && (
        <p className="mb-1 max-w-prose text-xs text-gray-500">{help_text}</p>
      )}
      {renderInput()}
      {addressMapsLink}
    </div>
  );
}
