"use client";

export function InvoicePrintButton() {
  return (
    <div className="mt-8 flex justify-end gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="btn-primary flex items-center gap-2 font-semibold shadow-sm hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Download / Print PDF Invoice
      </button>
    </div>
  );
}
