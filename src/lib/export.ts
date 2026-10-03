/** CSV / file download helpers (reports, exports). */
import { MAX_LOGO_CHARS } from "~shared/validation";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Builds a CSV (UTF-8 with BOM so Excel opens Indian characters correctly)
 * and triggers a download.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const escape = (value: string | number | null | undefined): string => {
    const str = value === null || value === undefined ? "" : String(value);
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));

  const csv = "\uFEFF" + lines.join("\r\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
}

export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  downloadBlob(new Blob([content], { type: `${mime};charset=utf-8` }), filename);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read the selected file."));
    reader.readAsDataURL(file);
  });
}

/** Down-scales an image and returns an image data URL (used for the business logo).
 *
 * PNG is preferred (it keeps transparency), but a big PNG data URL can be several
 * hundred kilobytes, so the image falls back to JPEG - and finally to a smaller
 * size - until it fits comfortably inside `MAX_LOGO_CHARS`.
 */
export function resizeImageToDataUrl(file: File, maxSize = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That file does not look like a valid image."));
      image.onload = () => {
        const encode = (
          width: number,
          height: number,
          type: "image/png" | "image/jpeg",
          quality?: number,
        ): string => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas is not available in this browser.");
          if (type === "image/jpeg") {
            // JPEG has no alpha channel - paint the background so logos don't go black.
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(image, 0, 0, width, height);
          return canvas.toDataURL(type, quality);
        };

        try {
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));

          let dataUrl = encode(width, height, "image/png");
          if (dataUrl.length > 160_000) dataUrl = encode(width, height, "image/jpeg", 0.85);
          if (dataUrl.length > MAX_LOGO_CHARS && Math.max(width, height) > 160) {
            dataUrl = encode(
              Math.max(1, Math.round(width * 0.5)),
              Math.max(1, Math.round(height * 0.5)),
              "image/jpeg",
              0.8,
            );
          }
          if (dataUrl.length > MAX_LOGO_CHARS) {
            reject(new Error("That image is still too large. Please try a smaller file."));
            return;
          }
          resolve(dataUrl);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Unable to process that image."));
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
