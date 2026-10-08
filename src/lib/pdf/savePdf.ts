/**
 * Cross-device PDF delivery.
 *
 * `jsPDF.save()` relies on `HTMLAnchorElement.download`, which silently does
 * nothing on several mobile browsers (notably iOS Safari, which has no blob
 * download manager). Every "Download PDF" action in the app goes through
 * `savePdf`, which:
 *
 *  1. builds the file as a Blob (smaller than the data-URL path),
 *  2. performs a real download where the browser supports it,
 *  3. otherwise opens the PDF in a new tab — on mobile that lands in the native
 *     viewer, from where the user can share / save / print it,
 *  4. falls back to jsPDF's own save if all else fails.
 */
import type { jsPDF } from "jspdf";

/** How the file reached the user. */
export type PdfDelivery = "downloaded" | "opened" | "failed";

/** iPads report a desktop UA, so combine UA + touch hints. */
function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iP(hone|ad|od)/.test(ua)) return true;
  // iPadOS 13+
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
}

function supportsDownload(): boolean {
  if (typeof document === "undefined") return false;
  if (isAppleMobile()) return false;
  return "download" in document.createElement("a");
}

/** Delivers `blob` to the user as `filename` on desktop and mobile alike. */
export function savePdfBlob(blob: Blob, filename: string): PdfDelivery {
  const url = URL.createObjectURL(blob);
  // Keep the URL alive long enough for the download / new tab to consume it.
  const revoke = () => window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (supportsDownload()) {
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      revoke();
      return "downloaded";
    } catch {
      /* fall through to the new-tab path */
    }
  }

  try {
    const win = window.open(url, "_blank");
    if (win) {
      revoke();
      return "opened";
    }
  } catch {
    /* popup blocked - fall through */
  }

  return "failed";
}

/** Generates and delivers a PDF using the device-appropriate mechanism. */
export function savePdf(doc: jsPDF, filename: string): PdfDelivery {
  try {
    return savePdfBlob(doc.output("blob"), filename);
  } catch {
    try {
      doc.save(filename);
      return "downloaded";
    } catch {
      return "failed";
    }
  }
}

/** Toast copy for a delivery result. */
export function pdfDeliveryMessage(result: PdfDelivery): { ok: boolean; message: string } {
  if (result === "downloaded") return { ok: true, message: "PDF downloaded." };
  if (result === "opened")
    return { ok: true, message: "PDF opened in a new tab — use Share to save or print it." };
  return { ok: false, message: "Could not deliver the PDF. Please try again." };
}
