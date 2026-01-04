"use client";

import React, { useEffect, useRef, useState } from "react";
import type { FormField1041, AudienceMode } from "@/types/forms";

type FieldRendererProps = {
  field: FormField1041;
  audience: AudienceMode;
  filingId: string;
  allAnswers: Record<string, any>;
  value: any;
  onChange: (val: any) => void;
};

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

  if (rawInput.includes("checkbox") && rawInput.includes("multi")) return "multi_select";
  if (rawInput.includes("checkbox")) return "checkbox_single";
  if (rawInput === "yes;no") return "select";
  if (rawInput.includes("date")) return "date";
  if (rawInput.includes("currency")) return "currency";
  if (rawInput.includes("number")) return "number";

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

  if (key.includes("ein") || label.includes("ein")) return "XX-XXXXXXX";
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

function getFileDisplayName(url: string): string {
  try {
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    return decodeURIComponent(last);
  } catch {
    return url;
  }
}

export function FieldRenderer({
  field,
  filingId,
  value,
  onChange,
}: FieldRendererProps) {
  const {
    field_key,
    label,
    help_text,
    required,
    is_calculated,
    source_notes,
    options,
    line_it,
  } = field;

  const kind = resolveInputKind(field);
  const disabled = is_calculated === true;
  const placeholder = getPlaceholder(field);
  const addressField = isAddressField(field);

  // ✅ defensive: never show field_key as a “default value”
  const safeValue =
    typeof value === "string" && value === field_key ? "" : value;

  // currency display state
  const [currencyDisplay, setCurrencyDisplay] = useState(
    kind === "currency" ? formatCurrency(safeValue) : ""
  );

  const addressInputRef = useRef<HTMLInputElement | null>(null);

  // attachment handling
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // info panel
  const [showInfo, setShowInfo] = useState(false);
  const hasInfo = !!source_notes;
  const infoTitle = source_notes || "";

  useEffect(() => {
    if (kind === "currency") {
      setCurrencyDisplay(formatCurrency(safeValue));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeValue, kind]);

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
      if (formatted) onChange(formatted);
    });

    return () => {
      if (google?.maps?.event && autocomplete) {
        google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, [addressField, disabled, onChange]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const target = e.target as HTMLInputElement;

    if (kind === "checkbox_single") {
      onChange(target.checked);
      return;
    }

    if (kind === "currency") {
      setCurrencyDisplay(target.value);
      return;
    }

    if (kind === "number") {
      const raw = target.value;
      const num = raw === "" ? null : Number(raw);
      onChange(Number.isNaN(num) ? null : num);
      return;
    }

    onChange(target.value);
  };

  const handleCurrencyBlur = () => {
    if (kind !== "currency") return;
    const cleaned = String(currencyDisplay ?? "").replace(/[^0-9.-]/g, "");
    const num = cleaned === "" ? null : Number(cleaned);

    if (num === null || Number.isNaN(num)) {
      onChange(null);
      setCurrencyDisplay("");
      return;
    }

    onChange(num);
    setCurrencyDisplay(formatCurrency(num));
  };

  // attachments
  const currentAttachmentUrls: string[] = Array.isArray(safeValue) ? safeValue : [];

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setAttachmentBusy(true);
    setAttachmentError(null);

    try {
      const formData = new FormData();
      formData.append("filingId", filingId);
      formData.append("fieldKey", field_key);

      for (const f of files) formData.append("files", f);

      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Upload failed");
      }

      const newUrls: string[] = json.urls || [];
      onChange([...currentAttachmentUrls, ...newUrls]);

      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setAttachmentError(err?.message || "Upload failed");
    } finally {
      setAttachmentBusy(false);
    }
  };

  const handleDeleteAttachment = async (url: string) => {
    setAttachmentBusy(true);
    setAttachmentError(null);

    try {
      const res = await fetch("/api/attachments/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Delete failed");
      }

      onChange(currentAttachmentUrls.filter((u) => u !== url));
    } catch (err: any) {
      setAttachmentError(err?.message || "Delete failed");
    } finally {
      setAttachmentBusy(false);
    }
  };

  const renderInput = () => {
    if (disabled) {
      const displayValue =
        kind === "currency" ? formatCurrency(safeValue) : (safeValue ?? "");
      const inputType =
        kind === "date" ? "date" : kind === "number" ? "number" : "text";

      return (
        <input
          type={inputType}
          value={displayValue}
          disabled
          className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
        />
      );
    }

    if (kind === "date") {
      return (
        <input
          type="date"
          value={safeValue ?? ""}
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
          value={safeValue ?? ""}
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
              checked={!!safeValue}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span>Check if this applies</span>
          </div>
          <p className="text-xs text-gray-500">Leave blank if not applicable.</p>
        </div>
      );
    }

    if (kind === "select" && options && options.length > 0) {
      return (
        <select
          value={safeValue ?? ""}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      );
    }

    if (kind === "multi_select" && options && options.length > 0) {
      const current: string[] = Array.isArray(safeValue) ? safeValue : [];

      const toggle = (opt: string) => {
        if (current.includes(opt)) {
          onChange(current.filter((v) => v !== opt));
        } else {
          onChange([...current, opt]);
        }
      };

      return (
        <div className="flex flex-wrap gap-2">
          {options.map((optRaw) => {
            const opt = String(optRaw);
            const active = current.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    if (kind === "attachment") {
      return (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
            disabled={attachmentBusy}
          >
            {attachmentBusy
              ? "Uploading…"
              : currentAttachmentUrls.length > 0
              ? "Add more files"
              : "Choose files"}
          </button>

          {currentAttachmentUrls.length === 0 ? (
            <p className="text-xs text-gray-400">No files attached yet.</p>
          ) : (
            <ul className="space-y-1 text-xs text-gray-600">
              {currentAttachmentUrls.map((url) => (
                <li
                  key={url}
                  className="flex items-center justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1"
                >
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate underline"
                    title={url}
                  >
                    {getFileDisplayName(url)}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDeleteAttachment(url)}
                    className="text-[11px] text-red-600 hover:underline disabled:opacity-50"
                    disabled={attachmentBusy}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {attachmentError && (
            <p className="text-xs text-red-600">{attachmentError}</p>
          )}
        </div>
      );
    }

    return (
      <input
        ref={addressField ? addressInputRef : undefined}
        type="text"
        value={safeValue ?? ""}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
    );
  };

  const addressMapsLink =
    addressField && typeof safeValue === "string" && safeValue.trim().length > 0 ? (
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          safeValue
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block text-xs text-blue-600 underline"
      >
        Search this address on Google Maps
      </a>
    ) : null;

  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between text-sm font-medium text-gray-800">
        <span className="flex items-center gap-2">
          {line_it && (
            <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">
              Line {line_it}
            </span>
          )}
          <span>
            {label}
            {required && <span className="ml-1 text-xs text-gray-400">*</span>}
          </span>
        </span>

        {hasInfo && (
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-gray-50 text-[10px] text-gray-500"
            title={infoTitle}
            aria-label="View details"
            onClick={() => setShowInfo((v) => !v)}
          >
            i
          </button>
        )}
      </label>

      {help_text && (
        <p className="mb-1 max-w-prose text-xs text-gray-500">{help_text}</p>
      )}

      {showInfo && hasInfo && (
        <p className="mb-1 max-w-prose rounded-md border border-blue-100 bg-blue-50 p-2 text-xs text-blue-800">
          {infoTitle}
        </p>
      )}

      {renderInput()}
      {addressMapsLink}
    </div>
  );
}

export default FieldRenderer;
