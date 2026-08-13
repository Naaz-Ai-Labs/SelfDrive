"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const showDetail = process.env.NODE_ENV !== "production";

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="card w-full max-w-lg p-8">
        <span className="badge bg-red-100 text-red-700">Error</span>
        <h1 className="mt-3 text-2xl font-display text-ink-900">This screen failed to load</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Something went wrong while rendering this page. No data was changed. Retry, or head back
          to the dashboard.
        </p>

        {showDetail && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/dashboard" className="btn-secondary">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
