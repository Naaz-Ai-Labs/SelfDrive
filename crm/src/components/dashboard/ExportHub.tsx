"use client";

export function ExportHub({
  reportData,
}: {
  reportData: Array<{ bookingNo: string; customer: string; vehicle: string; amount: number; status: string; date: string }>;
}) {
  function downloadCSV() {
    const headers = ["Booking No", "Customer", "Vehicle", "Amount (INR)", "Status", "Date"];
    const rows = reportData.map((r) => [r.bookingNo, `"${r.customer}"`, `"${r.vehicle}"`, r.amount, r.status, r.date]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Darshh_Tours_Financial_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function printStatement() {
    window.print();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={downloadCSV}
        className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs px-3 py-1.5 font-bold shadow-xs flex items-center gap-1.5"
      >
        <span>📥</span> Export CSV Spreadsheet
      </button>
      <button
        type="button"
        onClick={printStatement}
        className="btn-secondary text-xs px-3 py-1.5 font-bold shadow-xs flex items-center gap-1.5 border-ink-300"
      >
        <span>🖨️</span> Print / Save PDF
      </button>
    </div>
  );
}
