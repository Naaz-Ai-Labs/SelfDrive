# Client-Side Image Compression Algorithm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a high-performance in-browser image compression algorithm (`compressImageFile`) that scales down dimensions to 1600px and applies 80% JPEG/WebP quality compression before uploading images.

**Architecture:** Create `image-compression.ts` utility files in both `web` and `crm` apps. Integrate image pre-compression into `BookingForm.tsx`, `ImageUploader.tsx`, and all file upload handlers before sending FormData to the upload endpoints.

**Tech Stack:** HTML5 Canvas API, File & Blob API, TypeScript, React, Next.js.

## Global Constraints

- Never alter PDF files (`application/pdf`).
- Always preserve original image aspect ratio.
- Fallback to original file if compression does not reduce file size.

---

### Task 1: Create Image Compression Utility Module

**Files:**
- Create: `web/src/lib/image-compression.ts`
- Create: `crm/src/lib/image-compression.ts`

- [ ] **Step 1: Write `compressImageFile` function in `web/src/lib/image-compression.ts`**

```typescript
export async function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<File> {
  if (typeof window === "undefined" || !file || !file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}
```

- [ ] **Step 2: Mirror utility to `crm/src/lib/image-compression.ts`**

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/image-compression.ts crm/src/lib/image-compression.ts
git commit -m "feat(upload): add compressImageFile canvas compression utility"
```

---

### Task 2: Integrate Image Pre-Compression into Upload Handlers

**Files:**
- Modify: `web/src/components/booking/BookingForm.tsx`
- Modify: `crm/src/components/dashboard/ImageUploader.tsx`

- [ ] **Step 1: Update `BookingForm.tsx` upload function to compress file before sending**

```typescript
import { compressImageFile } from "@/lib/image-compression";

async function upload(kind: string, rawFile: File) {
  setUploading(kind);
  const file = await compressImageFile(rawFile, 1600, 0.8);
  const form = new FormData();
  form.append("file", file);
  // proceed to upload...
}
```

- [ ] **Step 2: Update `ImageUploader.tsx` in CRM to compress vehicle photos**

- [ ] **Step 3: Test production builds with `npm run build` in `web/` and `crm/`**

- [ ] **Step 4: Commit**

```bash
git add web/src/components/booking/BookingForm.tsx crm/src/components/dashboard/ImageUploader.tsx
git commit -m "feat(upload): pre-compress image files in BookingForm and ImageUploader before sending to server"
```
