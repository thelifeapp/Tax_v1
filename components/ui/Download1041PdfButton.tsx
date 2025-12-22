"use client";

import { useState } from "react";

interface Download1041PdfButtonProps {
  filingId: string;
  /**
   * If true, render a small icon-only button (for table row).
   * Otherwise render a full text button.
   */
  iconOnly?: boolean;
}

/**
 * Client-side button that calls /api/filings/[filingId]/1041/pdf
 * and triggers a download of the filled 1041 PDF.
 */
export function Download1041PdfButton({
  filingId,
  iconOnly = false,
}: Download1041PdfButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);

      const res = await fetch(`/api/filings/${filingId}/1041/pdf`, {
        method: "GET",
      });

      if (!res.ok) {
        console.error("Failed to generate 1041 PDF", await res.text());
        alert("There was a problem generating the 1041 PDF.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `1041_${filingId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading 1041 PDF:", err);
      alert("Unexpected error downloading the 1041 PDF.");
    } finally {
      setLoading(false);
    }
  };

  // Same palette as the "draft" pill:
  // light gray background, gray border, gray text.
  const baseClasses =
    "inline-flex items-center justify-center rounded-md border border-gray-300 bg-gray-100 text-gray-700 shadow-sm hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60";

  const fullButtonClasses = `${baseClasses} px-3 py-2 text-sm font-medium`;
  const iconButtonClasses = `${baseClasses} h-8 w-8 text-base font-semibold p-0`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={iconOnly ? iconButtonClasses : fullButtonClasses}
      title="Download 1041 PDF"
    >
      {loading
        ? iconOnly
          ? "…" // small loading indicator
          : "Generating 1041 PDF…"
        : iconOnly
        ? "↓" // little down arrow icon
        : "Download 1041 PDF"}
    </button>
  );
}
