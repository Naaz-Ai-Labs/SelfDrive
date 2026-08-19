"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadSignedHandoverDocument } from "@/lib/actions";

type SignedDoc = {
  id: number;
  file_path: string;
  number?: string | null;
  created_at?: string | null;
};

export function SignedDocumentUploader({
  bookingId,
  existingSignedDocs,
}: {
  bookingId: number;
  existingSignedDocs: SignedDoc[];
}) {
  const router = useRouter();
  const [docType, setDocType] = useState<"handover" | "return">("handover");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please select the signed document (PDF or scanned images) to upload.");
      return;
    }
    setError("");
    setSuccess("");
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "signed_agreements");

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await uploadRes.json();
      if (!data.ok || !data.path) {
        setError(data.error || "Failed to upload file to storage.");
        setUploading(false);
        return;
      }

      startTransition(async () => {
        try {
          const res = await uploadSignedHandoverDocument({
            bookingId,
            filePath: data.path,
            docType,
            notes: notes.trim() || undefined,
          });

          if (res.ok) {
            setSuccess(`Signed ${docType === "return" ? "Return & Settlement" : "Handover"} document uploaded and verified successfully!`);
            setFile(null);
            setNotes("");
            router.refresh();
          } else {
            setError(res.error || "Failed to record signed document in booking.");
          }
        } catch (err: any) {
          setError(err?.message || "Could not save signed document record.");
        } finally {
          setUploading(false);
        }
      });
    } catch (err: any) {
      setError(err?.message || "Error uploading document.");
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {existingSignedDocs.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-emerald-700 text-base">✓</span>
            <p className="text-xs font-bold text-emerald-900">
              Physically Signed Document Scans On Record ({existingSignedDocs.length})
            </p>
          </div>
          <ul className="mt-2.5 space-y-2">
            {existingSignedDocs.map((doc) => {
              const fileName = doc.file_path.split("/").pop() || "signed_document.pdf";
              const isReturnDoc = String(doc.number || "").includes("SIGNED-RETURN");
              return (
                <li
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border border-emerald-200/80 bg-white px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-sm">{isReturnDoc ? "🏁" : "📄"}</span>
                    <div className="truncate">
                      <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-sm mr-1.5 ${isReturnDoc ? "bg-cyan-100 text-cyan-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {isReturnDoc ? "RETURN SETTLEMENT" : "HANDOVER AGREEMENT"}
                      </span>
                      <span className="font-mono font-medium text-ink-800 truncate">
                        {doc.number || fileName}
                      </span>
                    </div>
                  </div>
                  <a
                    href={doc.file_path}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-200 transition ml-2"
                  >
                    View / Download
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <form onSubmit={handleUpload} className="rounded-xl border border-ink-200 bg-white p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-ink-900 uppercase tracking-wider">
            Upload Physically Signed Inspection Agreement (PDF / Scan)
          </h3>
          <span className="text-[10px] text-ink-500 font-medium">
            Staff Audit Requirement
          </span>
        </div>
        <p className="text-[11px] text-ink-600">
          After physical signatures are collected from the customer and staff officer, photograph or scan all pages of the document and upload below to create a tamper-evident audit record.
        </p>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-700 font-medium">
            {success}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label text-[11px]">Agreement Stage *</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as "handover" | "return")}
              className="input text-xs py-1.5"
              disabled={uploading || pending}
            >
              <option value="handover">Handover Agreement (Pickup)</option>
              <option value="return">Return & Settlement Agreement (Drop-off)</option>
            </select>
          </div>

          <div>
            <label className="label text-[11px]">Select Signed Document (PDF / Scan) *</label>
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="input text-xs py-1.5"
              disabled={uploading || pending}
              required
            />
          </div>

          <div>
            <label className="label text-[11px]">Officer Notes & Remarks</label>
            <input
              type="text"
              placeholder="e.g. Scanned 2 pages with all signatures"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input text-xs py-1.5"
              disabled={uploading || pending}
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={uploading || pending || !file}
            className="btn-primary text-xs py-1.5 px-4 font-semibold"
          >
            {uploading || pending ? "Uploading & Recording..." : `📤 Upload Signed ${docType === "return" ? "Return" : "Handover"} Document`}
          </button>
        </div>
      </form>
    </div>
  );
}
