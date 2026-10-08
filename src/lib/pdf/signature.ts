import type { jsPDF } from "jspdf";

export interface SignatureBox {
  x: number;
  y: number;
  /** Top of the area the signature may occupy. */
  w: number;
  h: number;
  align?: "left" | "right";
}

/**
 * Draws an uploaded picture (signature, company seal - a data URL, PNG or
 * JPEG) inside `box`, scaled to fit while preserving its aspect ratio.
 * Returns false when there is no usable image, so callers can simply ignore
 * the result.
 *
 * Shared by both PDF layouts so the preview, the print output and the
 * downloaded PDF always show the same pictures.
 */
export function addImageToFit(
  doc: jsPDF,
  dataUrl: string | null | undefined,
  box: SignatureBox,
): boolean {
  if (!dataUrl || !/^data:image\/(png|jpe?g);base64,/.test(dataUrl)) return false;
  if (box.w <= 0 || box.h <= 0) return false;

  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = (props.width || 1) / (props.height || 1);
    if (!Number.isFinite(ratio) || ratio <= 0) return false;

    let w = box.w;
    let h = w / ratio;
    if (h > box.h) {
      h = box.h;
      w = h * ratio;
    }
    const x = box.align === "left" ? box.x : box.x + box.w - w;
    const y = box.y + (box.h - h) / 2;

    // No explicit format: jsPDF detects PNG/JPEG from the data URL.
    doc.addImage(dataUrl, x, y, w, h, undefined, "FAST");
    return true;
  } catch {
    return false;
  }
}
