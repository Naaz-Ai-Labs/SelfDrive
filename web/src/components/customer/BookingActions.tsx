"use client";

import { useState, useTransition } from "react";
import { customerRequestCancellation, customerRequestRefund, customerReportProblem } from "@/lib/portal-actions";

export function BookingActions({ bookingId, status, depositAmount }: { bookingId: number; status: string; depositAmount: number }) {
  const [mode, setMode] = useState<"idle" | "cancel" | "refund" | "problem">("idle");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("other");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  const canCancel = ["Pending verification", "Pending payment", "Payment received", "Confirmed", "Ready for pickup"].includes(status);
  const canRefund = ["Completed", "Cancelled", "Vehicle returned"].includes(status);

  function submit() {
    if (reason.trim().length < 5) { setError("Please tell us a bit more (at least 5 characters)."); return; }
    setError("");
    startTransition(async () => {
      if (mode === "cancel") {
        const res = await customerRequestCancellation(bookingId, reason.trim());
        if ("error" in res && res.error) setError(res.error); else setDone("Your cancellation request has been recorded. Our team will confirm shortly.");
      } else if (mode === "refund") {
        const res = await customerRequestRefund(bookingId, reason.trim(), depositAmount);
        if ("error" in res && res.error) setError(res.error); else setDone("Your refund request has been submitted for review.");
      } else if (mode === "problem") {
        const res = await customerReportProblem(bookingId, category, reason.trim());
        if ("error" in res && res.error) setError(res.error); else setDone("Thanks — we've logged your report and will reach out shortly.");
      }
    });
  }

  if (done) {
    return <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{done}</p>;
  }

  return (
    <div className="mt-4 border-t border-ink-100 pt-4">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          {canCancel && <button type="button" onClick={() => setMode("cancel")} className="btn-secondary px-4 py-2 text-xs">Request cancellation</button>}
          {canRefund && <button type="button" onClick={() => setMode("refund")} className="btn-secondary px-4 py-2 text-xs">Request refund</button>}
          <button type="button" onClick={() => setMode("problem")} className="btn-secondary px-4 py-2 text-xs">Report a problem</button>
        </div>
      )}
      {mode !== "idle" && (
        <div className="space-y-3">
          {mode === "problem" && (
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {["breakdown", "tyre", "battery", "engine", "accident", "existing_damage", "fuel", "document", "misuse", "other"].map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          )}
          <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "cancel" ? "Why are you cancelling?" : mode === "refund" ? "Reason for refund request" : "Describe the problem"} />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={submit} disabled={pending} className="btn-primary">{pending ? "Sending…" : "Submit"}</button>
            <button type="button" onClick={() => { setMode("idle"); setReason(""); setError(""); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="field-error mt-2" role="alert">{error}</p>}
    </div>
  );
}
