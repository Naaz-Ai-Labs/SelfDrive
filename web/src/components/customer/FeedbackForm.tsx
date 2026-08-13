"use client";

import { useState, useTransition } from "react";
import { customerAddFeedback } from "@/lib/portal-actions";

export function FeedbackForm({ bookingId }: { bookingId: number }) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (review.trim().length < 10) {
      setError("Please write at least a few words — it genuinely helps us improve.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await customerAddFeedback({ bookingId, rating, review: review.trim(), isPublic });
      if (res?.error) setError(res.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
        Thank you for your feedback! It helps us serve future customers better.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-5 rounded-xl border border-ink-100 bg-ink-50/60 p-4">
      <p className="text-sm font-semibold text-ink-900">How was your ride?</p>
      <div className="mt-3 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRating(r)}
            aria-label={`${r} star${r > 1 ? "s" : ""}`}
            className={`flex h-11 w-11 items-center justify-center text-2xl transition ${r <= rating ? "text-amber-500" : "text-ink-200 hover:text-amber-300"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="input mt-3 min-h-20"
        value={review}
        onChange={(e) => setReview(e.target.value)}
        placeholder="Share your experience — what went well, what could improve…"
      />
      <label className="mt-3 flex items-center gap-2 text-xs text-ink-600">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-3.5 w-3.5 accent-brand-600" />
        I am happy for this review to appear on the website
      </label>
      {error && <p className="field-error mt-2" role="alert">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary mt-4">
        {pending ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
