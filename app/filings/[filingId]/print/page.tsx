"use client";

import { useParams, useRouter } from "next/navigation";

export default function Print1041Page() {
  const params = useParams<{ filingId: string }>();
  const router = useRouter();

  const filingId = params?.filingId;

  // ✅ Inline preview URL (renders in iframe / browser PDF viewer)
  const pdfInlineUrl = filingId
    ? `/api/filings/${filingId}/1041/pdf?inline=1`
    : "";

  // ✅ Download URL (forces download)
  const pdfDownloadUrl = filingId
    ? `/api/filings/${filingId}/1041/pdf`
    : "";

  if (!filingId) {
    return (
      <div className="mx-auto max-w-5xl py-8">
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          Missing filingId.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            1041 Print Preview
          </h1>
          <p className="text-sm text-gray-600">
            Review the populated IRS 1041 PDF. Use your browser’s print dialog to
            print or save as PDF.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => router.push(`/filings/${filingId}/intake`)}
          >
            Back to intake
          </button>

          <button
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => window.open(pdfInlineUrl, "_blank")}
            title="Open PDF preview in a new tab"
          >
            Open in new tab
          </button>

          <button
            className="rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-gray-900"
            onClick={() => (window.location.href = pdfDownloadUrl)}
            title="Download PDF"
          >
            Download
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
        <iframe
          src={pdfInlineUrl}
          className="h-[80vh] w-full rounded-md"
          title="1041 PDF Preview"
        />
      </div>

      <div className="text-xs text-gray-500">
        Tip: On Mac, press <span className="font-medium">Cmd+P</span> in the PDF
        preview to print / save.
      </div>
    </div>
  );
}
