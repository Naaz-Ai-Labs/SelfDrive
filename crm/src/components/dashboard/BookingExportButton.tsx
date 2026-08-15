"use client";

import { useState } from "react";

/**
 * Downloads the full record for one booking as a PDF, including the customer's
 * uploaded identity documents.
 *
 * Convenience only — /api/bookings/[id]/export checks the session and role
 * server-side, so showing or hiding this button controls nothing.
 *
 * Read as a blob rather than opened in a tab: the route needs the session cookie
 * and returns JSON on failure, so this surfaces an error message instead of
 * dumping raw JSON into a new window.
 */
export function BookingExportButton({ bookingId, bookingNo }: { bookingId: number; bookingNo: string }) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function download() {
    setState("working");
    setMessage("");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/export`);

      if (!res.ok) {
        const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
        const detail = isJson ? ((await res.json().catch(() => null))?.error as string | undefined) : undefined;
        throw new Error(detail || `Export failed (${res.status}).`);
      }

      // A JSON body on a 200 means generation failed upstream — never hand the user
      // a file named .pdf that is actually an error payload.
      if (!(res.headers.get("content-type") ?? "").includes("application/pdf")) {
        throw new Error("The server did not return a PDF.");
      }

      const blob = await res.blob();
      if (blob.size === 0) throw new Error("The generated document was empty.");

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bookingNo || `booking-${bookingId}`}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setState("idle");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Export failed.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={download}
        disabled={state === "working"}
        className="btn-secondary w-full disabled:opacity-60"
      >
        {state === "working" ? "Preparing document…" : "Download booking record (PDF)"}
      </button>
      {state === "error" && <span className="text-xs font-medium text-red-600">{message}</span>}
      <span className="text-[11px] text-ink-400">
        Includes booking details, payments and the uploaded ID proofs.
      </span>
    </div>
  );
}
