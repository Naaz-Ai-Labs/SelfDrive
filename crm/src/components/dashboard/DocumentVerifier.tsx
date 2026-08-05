"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyCustomerDocument } from "@/lib/actions";

type DocRow = Record<string, unknown>;

type DocItem = {
  id: number;
  kind: string;
  number: string | null;
  expiry_date: string | null;
  file_path: string;
  verified: number;
};

function toDocItem(r: DocRow): DocItem {
  return {
    id: Number(r.id),
    kind: String(r.kind ?? "other"),
    number: r.number != null ? String(r.number) : null,
    expiry_date: r.expiry_date != null ? String(r.expiry_date) : null,
    file_path: String(r.file_path ?? ""),
    verified: Number(r.verified ?? 0),
  };
}

const KIND_LABEL: Record<string, { label: string; icon: string }> = {
  licence: { label: "Driving Licence", icon: "🪪" },
  govt_id: { label: "Aadhaar / Govt ID", icon: "🆔" },
  address_proof: { label: "Address Proof", icon: "🏠" },
  photo: { label: "Customer Photo", icon: "👤" },
  other: { label: "Other Document", icon: "📄" },
};

export function DocumentVerifier({ documents }: { documents: DocRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  const [zoom, setZoom] = useState(1);

  const docItems = documents.map(toDocItem);
  const totalVerified = docItems.filter((d) => d.verified === 1).length;

  function handleVerify(documentId: number, approve: boolean) {
    startTransition(async () => {
      await verifyCustomerDocument({ documentId, approve });
      if (selectedDoc?.id === documentId) {
        setSelectedDoc((prev) => (prev ? { ...prev, verified: approve ? 1 : 0 } : null));
      }
      router.refresh();
    });
  }

  if (docItems.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-ink-400">
        No documents uploaded by customer yet.
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4 shadow-sm border border-ink-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Customer Identification Documents
          </h2>
          <p className="text-xs text-ink-500">
            Inspect Driving Licence & Aadhaar Card images for manual staff verification
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              totalVerified === docItems.length
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {totalVerified === docItems.length ? "All Documents Verified ✓" : `${totalVerified}/${docItems.length} Verified`}
          </span>
        </div>
      </div>

      {/* Document Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {docItems.map((doc) => {
          const info = KIND_LABEL[doc.kind] ?? KIND_LABEL.other;
          const isVerified = doc.verified === 1;

          return (
            <div
              key={doc.id}
              className={`group flex flex-col justify-between overflow-hidden rounded-xl border transition ${
                isVerified ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200 bg-amber-50/20"
              }`}
            >
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-ink-900 flex items-center gap-1.5">
                    <span>{info.icon}</span> {info.label}
                  </span>
                  <span
                    className={`badge text-[11px] ${
                      isVerified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {isVerified ? "Verified ✓" : "Pending Verification ⏳"}
                  </span>
                </div>

                {doc.number && (
                  <p className="font-mono text-xs font-semibold text-ink-800">
                    Doc No: {doc.number}
                  </p>
                )}

                {doc.expiry_date && (
                  <p className="text-xs text-ink-500">Expires: {doc.expiry_date}</p>
                )}

                {/* Thumbnail Image Box */}
                <div
                  onClick={() => {
                    setSelectedDoc(doc);
                    setZoom(1);
                  }}
                  className="relative cursor-pointer overflow-hidden rounded-lg border border-ink-200 bg-ink-900 aspect-video flex items-center justify-center group-hover:border-brand-500"
                >
                  <img
                    src={doc.file_path}
                    alt={info.label}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    onError={(e) => {
                      // Fallback for non-image or file paths
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                    <span className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-ink-900 shadow">
                      🔍 Inspect & Zoom
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex border-t border-ink-100 bg-white p-2.5 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDoc(doc);
                    setZoom(1);
                  }}
                  className="btn-secondary flex-1 justify-center py-1.5 text-xs"
                >
                  Inspect Photo
                </button>
                {isVerified ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleVerify(doc.id, false)}
                    className="btn-secondary justify-center py-1.5 px-3 text-xs text-red-600 hover:bg-red-50"
                  >
                    Unverify
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleVerify(doc.id, true)}
                    className="btn-primary justify-center py-1.5 px-3 text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    Approve ✓
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full-Screen Lightbox Modal for Manual Staff Verification */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4 bg-ink-900 text-white">
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {KIND_LABEL[selectedDoc.kind]?.icon ?? "📄"}
                </span>
                <div>
                  <h3 className="font-display font-semibold text-base">
                    {KIND_LABEL[selectedDoc.kind]?.label ?? "Document Viewer"}
                  </h3>
                  {selectedDoc.number && (
                    <p className="font-mono text-xs text-ink-300">
                      ID: {selectedDoc.number}
                    </p>
                  )}
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20"
                >
                  Zoom -
                </button>
                <span className="font-mono text-xs text-ink-300">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20"
                >
                  Zoom +
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="ml-2 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/30"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Modal Image Viewport */}
            <div className="relative flex-1 overflow-auto bg-ink-950 p-6 flex items-center justify-center min-h-[350px]">
              <img
                src={selectedDoc.file_path}
                alt="Document Full Preview"
                style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-lg"
              />
            </div>

            {/* Modal Footer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 bg-ink-50 px-6 py-4">
              <div>
                <span
                  className={`badge ${
                    selectedDoc.verified === 1
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  Status: {selectedDoc.verified === 1 ? "Verified ✓" : "Pending Verification"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleVerify(selectedDoc.id, false)}
                  className="btn-secondary text-xs text-red-600 hover:bg-red-50 border-red-200"
                >
                  Reject / Request Re-upload
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleVerify(selectedDoc.id, true)}
                  className="btn-primary text-xs bg-emerald-600 hover:bg-emerald-700"
                >
                  {pending ? "Saving..." : "Approve & Mark Verified ✓"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
