"use client";

import { useState } from "react";

/**
 * Downloads a customer's consolidated record as a PDF.
 *
 * This button is convenience only — /api/customers/[id]/export enforces the session
 * and role server-side, so hiding or showing it changes nothing about who can
 * actually export.
 *
 * The response is read as a blob rather than pointed at with window.open, because
 * the route requires the session cookie and returns JSON on failure; this way an
 * error surfaces as a message instead of a browser tab showing raw JSON.
 */
export function CustomerExportButton({ customerId, customerName }: { customerId: number; customerName: string }) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function download() {
    setState("working");
    setMessage("");
    try {
      const res = await fetch(`/api/customers/${customerId}/export`);

      if (!res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        const detail = contentType.includes("application/json")
          ? ((await res.json().catch(() => null))?.error as string | undefined)
          : undefined;
        throw new Error(detail || `Export failed (${res.status}).`);
      }

      // A JSON body on a 200 means something went wrong upstream; do not hand the
      // user a file called .pdf that is actually an error payload.
      if (!(res.headers.get("content-type") ?? "").includes("application/pdf")) {
        throw new Error("The server did not return a PDF.");
      }

      const blob = await res.blob();
      if (blob.size === 0) throw new Error("The generated document was empty.");

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customer-record-${customerId}.pdf`;
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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={state === "working"}
        aria-label={`Download customer record for ${customerName}`}
        className="btn-secondary px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        {state === "working" ? "Preparing…" : "Export"}
      </button>
      {state === "error" && <span className="text-[10px] font-medium text-red-600">{message}</span>}
    </div>
  );
}
