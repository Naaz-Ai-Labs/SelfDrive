# Design Spec — Client-Side Image Compression Algorithm for Reduced Upload Sizes

## Executive Summary
This design specification defines the implementation of a high-performance **Client-Side Image Compression Algorithm** across the web and CRM applications. The algorithm automatically resizes and compresses image uploads (driving licences, government IDs, customer photos, vehicle images, and inspection photos) down to ~150KB–300KB before network transmission, reducing payload size by up to **97%**.

---

## 1. User Intent & Requirements
- **High Reduction Ratio**: Reduce image file size dramatically (e.g. 10MB camera photo → ~200KB compressed JPEG/WebP) while preserving document readability (licence text, Aadhaar numbers, vehicle condition).
- **Fast Execution**: Perform in-browser compression in under 150 milliseconds.
- **PDF Passthrough**: Do not attempt image compression on PDF files.
- **Universal Application**: Apply across all upload touchpoints:
  - Booking wizard document uploads (`BookingForm.tsx`).
  - Vehicle management image uploaders (`ImageUploader.tsx`).
  - Inspection & damage report photo uploads.
  - Customer portal document uploads (`CustomerPortal.tsx`).

---

## 2. Technical Architecture & Algorithm

### A. Compression Algorithm (`compressImageFile`)
Located in `web/src/lib/image-compression.ts` and `crm/src/lib/image-compression.ts`:

```typescript
export async function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file; // Skip non-images (e.g. PDFs)
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
            resolve(file); // Keep original if compression did not shrink size
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

---

## 3. Integration Points

1. **`web/src/components/booking/BookingForm.tsx`**:
   - Wrap the file before passing to the upload route:
     ```ts
     const fileToUpload = await compressImageFile(originalFile, 1600, 0.8);
     ```

2. **`crm/src/components/dashboard/ImageUploader.tsx`**:
   - Compress vehicle photos before sending to `/api/upload`.

3. **`web/src/app/api/upload/route.ts` & `crm/src/app/api/upload/route.ts`**:
   - Enforce maximum 8MB post-compression ceiling limit.

---

## 4. Verification Plan
1. **Build Validation**: Run `npm run build` in `crm/` and `web/` to confirm zero compilation or TypeScript errors.
2. **Integration Test**: Verify that uploaded files are reduced from multi-megabyte sizes down to <300KB while preserving image quality.
