/**
 * Client-Side Image Compression
 * Resizes large camera photos to a max dimension and JPEG-encodes them down into a
 * target size band (100KB-400KB, "medium" quality) before upload — instead of a single
 * fixed quality pass, it steps quality (and, only if quality alone can't get there,
 * resolution) down until the result fits the band or the floor is reached.
 *
 * No step ever drops the image: every attempt still produces and keeps a file. If the
 * floor is reached and the photo is still over 400KB (an unusually large/detailed
 * source), the smallest attempt made is used as-is rather than failing or discarding it.
 */

const TARGET_MAX_BYTES = 400 * 1024;
// Informational floor only — a photo that's already smaller than this after one pass
// is left alone. Padding it back up would mean re-encoding losslessly-fine data for
// no visual gain, so it's never enforced.
const TARGET_MIN_BYTES = 100 * 1024;

const MEDIUM_QUALITY = 0.7;
// Quality floor: below this JPEG artifacting starts destroying detail (ID text,
// scratches), so once reached the image is accepted as-is rather than pushed further.
const QUALITY_FLOOR = 0.4;
const QUALITY_STEP = 0.1;
// Only used if the quality floor alone can't reach the target (very high-res source).
const DIMENSION_FLOOR = 1000;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function drawScaled(img: HTMLImageElement, maxDimension: number): HTMLCanvasElement {
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
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
  }
  return canvas;
}

export async function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = MEDIUM_QUALITY
): Promise<File> {
  if (
    typeof window === "undefined" ||
    !file ||
    !file.type.startsWith("image/") ||
    file.type === "image/gif"
  ) {
    return file; // Skip non-images (e.g. PDFs) or server-side environments
  }

  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }

  let best: Blob | null = null;
  let dimension = maxDimension;

  // Step quality down first (cheapest — same canvas, no redraw); only shrink the
  // canvas dimension if quality alone can't reach the target band.
  while (true) {
    const canvas = drawScaled(img, dimension);
    for (let q = quality; q >= QUALITY_FLOOR - 1e-9; q -= QUALITY_STEP) {
      const blob = await canvasToBlob(canvas, q);
      if (!blob) continue;
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= TARGET_MAX_BYTES) {
        return finalize(best, file);
      }
    }
    if (dimension <= DIMENSION_FLOOR) break;
    dimension = Math.max(DIMENSION_FLOOR, Math.round(dimension * 0.8));
  }

  // Floor reached and still over the target band — an unusually large/detailed
  // source. Use the smallest attempt made rather than failing or dropping the image.
  return finalize(best, file);
}

function finalize(best: Blob | null, original: File): File {
  if (!best || best.size >= original.size) return original;
  return new File([best], original.name.replace(/\.[^/.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
