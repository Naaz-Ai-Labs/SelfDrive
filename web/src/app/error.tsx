"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
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
    <main className="container-x flex min-h-[70vh] items-center justify-center py-24">
      <div className="card w-full max-w-lg p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-bred-500">Something broke</p>
        <h1 className="mt-3 text-3xl font-display text-ink-950">This page didn&apos;t load</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          Sorry — an unexpected error stopped this page from rendering. Your booking data is safe.
          Try again, and if it keeps happening please contact us.
        </p>

        {showDetail && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-none border-2 border-ink-200 bg-ink-50 p-3 text-xs text-ink-700">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
