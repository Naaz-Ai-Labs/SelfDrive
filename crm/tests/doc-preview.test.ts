/**
 * Document preview type detection (customer_documents.file_path -> image vs PDF).
 *
 * customer_documents carries no stored MIME type, so this is extension-based
 * (the fallback tier) — every upload path in this codebase writes a real extension,
 * either directly in the URL or inside the private-bucket route's `p=` query param.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDocFileExtension, isPdfDocument, isImageDocument } from "../src/lib/doc-preview";

test("direct URL with a real image extension is detected as an image", () => {
  const url = "https://xyz.supabase.co/storage/v1/object/public/vehicle-photos/customer-documents/2026-08/sample_dl.jpg";
  assert.equal(getDocFileExtension(url), "jpg");
  assert.equal(isImageDocument(url), true);
  assert.equal(isPdfDocument(url), false);
});

test("direct URL ending in .pdf is detected as a PDF, not an image", () => {
  const url = "https://xyz.supabase.co/storage/v1/object/public/vehicle-photos/customer-documents/2026-08/licence.pdf";
  assert.equal(getDocFileExtension(url), "pdf");
  assert.equal(isPdfDocument(url), true);
  assert.equal(isImageDocument(url), false);
});

test("private-bucket route with a PDF inside the p= query param is detected as a PDF", () => {
  const url = "/api/files/doc?p=docs%2F2026-08%2Flicence_1787597956116_eorvy88itb.pdf";
  assert.equal(getDocFileExtension(url), "pdf");
  assert.equal(isPdfDocument(url), true);
});

test("private-bucket route with an image inside the p= query param is detected as an image", () => {
  const url = "/api/files/doc?p=docs%2F2026-08%2Fphoto_1787597967108_72jlaqymjw.jpeg";
  assert.equal(getDocFileExtension(url), "jpeg");
  assert.equal(isImageDocument(url), true);
  assert.equal(isPdfDocument(url), false);
});

test("case-insensitive extension matching", () => {
  assert.equal(isPdfDocument("/api/files/doc?p=docs/x.PDF"), true);
  assert.equal(isImageDocument("https://x/y/z.PNG"), true);
});

test("all documented supported image extensions are recognised", () => {
  for (const ext of ["jpg", "jpeg", "png", "webp", "gif"]) {
    assert.equal(isImageDocument(`https://x/y/z.${ext}`), true, ext);
  }
});

test("unknown or missing extension is neither image nor PDF (safe fallback path)", () => {
  assert.equal(isPdfDocument(""), false);
  assert.equal(isImageDocument(""), false);
  assert.equal(isPdfDocument(null), false);
  assert.equal(isPdfDocument(undefined), false);
  assert.equal(isImageDocument("https://x/y/z"), false);
  assert.equal(isPdfDocument("https://x/y/z.docx"), false);
});
