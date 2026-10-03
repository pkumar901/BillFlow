/**
 * Printing helpers.
 *
 * The invoice is printed from a dedicated window that reuses the stylesheets of
 * the app, so the printed output matches the on-screen A4 layout exactly.
 */

function collectStyles(): string {
  const parts: string[] = [];
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => {
    parts.push(el.outerHTML);
  });
  return parts.join("\n");
}

function openWindow(title: string): Window | null {
  return window.open("", "_blank", "width=1000,height=800,noopener=no");
}

/** Renders `node` (already in the DOM) in a new window and opens the print dialog. */
export function printNode(node: HTMLElement, title: string): void {
  const win = openWindow(title);
  if (!win) {
    window.print(); // popup blocked - fall back to printing the current page
    return;
  }

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
${collectStyles()}
<style>
  @page { size: A4; margin: 8.5mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .invoice-sheet { box-shadow: none !important; width: 100% !important; min-height: auto !important; padding: 0 !important; margin: 0 !important; }
  .no-print { display: none !important; }
</style>
</head>
<body>${node.outerHTML}</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();

  const print = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  };
  if (document.readyState === "complete") setTimeout(print, 250);
  else window.addEventListener("load", () => setTimeout(print, 250), { once: true });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
