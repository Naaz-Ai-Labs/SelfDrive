/**
 * Document preview type detection for customer_documents.file_path.
 *
 * The table carries no stored MIME type, and the serving routes
 * (/api/files/doc, /api/files/[name], /api/files/[...path]) already resolve the
 * correct Content-Type themselves — from the private bucket's stored object type, or
 * from the file extension for local-disk uploads. The one thing missing is telling the
 * CRM's <img>-only viewer that a PDF isn't an image at all, so this only needs the file
 * extension embedded in file_path, which every upload path in this codebase writes.
 *
 * Handles both file_path shapes in use:
 *   - a direct URL/local path ending in a real extension, e.g. ".../sample_dl.jpg"
 *   - the private-bucket route "/api/files/doc?p=<url-encoded-storage-path>.pdf"
 */
export function getDocFileExtension(filePath: string | null | undefined): string {
  if (!filePath) return "";
  let candidate = filePath;
  const queryIndex = filePath.indexOf("?");
  if (queryIndex !== -1) {
    const params = new URLSearchParams(filePath.slice(queryIndex + 1));
    candidate = params.get("p") || filePath;
  }
  const clean = candidate.split("#")[0];
  const match = /\.([a-zA-Z0-9]+)$/.exec(clean);
  return match ? match[1].toLowerCase() : "";
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export function isPdfDocument(filePath: string | null | undefined): boolean {
  return getDocFileExtension(filePath) === "pdf";
}

export function isImageDocument(filePath: string | null | undefined): boolean {
  return IMAGE_EXTENSIONS.has(getDocFileExtension(filePath));
}
