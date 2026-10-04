import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { INTER_BOLD_BASE64, INTER_REGULAR_BASE64 } from "./fontData";
import { amountInWords, formatDate, formatINR } from "@/lib/format";
import type { CopyLabel } from "@/components/invoices/InvoiceDocument";
import { shippingAddressLines, stateCodeOf } from "@/components/invoices/invoiceShared";
import type { InvoiceDetail } from "~shared/types";
import { buildStandardInvoicePdf } from "./standardInvoicePdf";

const A4 = { width: 210, height: 297 };
const MARGIN = 12;
const CONTENT_WIDTH = A4.width - MARGIN * 2; // 186mm

export interface PdfOptions {
  copyLabel?: CopyLabel;
  fileName?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || "#0f766e").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = Number.parseInt(full.slice(0, 6) || "0f766e", 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > A4.height - MARGIN - 6) {
    doc.addPage();
    return MARGIN + 4;
  }
  return y;
}

/** Builds the invoice PDF (A4, multi-page safe). Returns the jsPDF instance. */
export function buildInvoicePdf(detail: InvoiceDetail, options: PdfOptions = {}): jsPDF {
  // The "Standard" template has its own reference-style layout.
  if ((detail.settings.template || "classic") === "standard") {
    return buildStandardInvoicePdf(detail, options);
  }

  const { invoice, items, customer, business, settings } = detail;
  const accent = hexToRgb(settings.accent_color || "#0f766e");
  const copyLabel = options.copyLabel || "Original for Recipient";
  const interstate = Boolean(invoice.interstate);

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("BillFlow-Regular.ttf", INTER_REGULAR_BASE64);
  doc.addFont("BillFlow-Regular.ttf", "BillFlow", "normal");
  doc.addFileToVFS("BillFlow-Bold.ttf", INTER_BOLD_BASE64);
  doc.addFont("BillFlow-Bold.ttf", "BillFlow", "bold");

  const setFont = (weight: "normal" | "bold", size: number) => {
    doc.setFont("BillFlow", weight);
    doc.setFontSize(size);
  };
  const setDark = () => doc.setTextColor(17, 24, 39);
  const setMuted = () => doc.setTextColor(100, 116, 139);

  let y = MARGIN;

  /* ------------------------------------------------------------ header -- */
  const headerHeight = 24;
  doc.setFillColor(...accent);
  doc.rect(0, 0, A4.width, headerHeight, "F");

  let logoWidth = 0;
  if (business.logo_url) {
    try {
      const format = business.logo_url.includes("image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(business.logo_url, format, MARGIN, 5, 16, 16, undefined, "FAST");
      logoWidth = 21;
    } catch {
      logoWidth = 0; // never fail the PDF because of a logo
    }
  }

  doc.setTextColor(255, 255, 255);
  setFont("bold", 15);
  doc.text((settings.invoice_title || "TAX INVOICE").toUpperCase(), MARGIN + logoWidth, 11);
  setFont("normal", 8);
  doc.text(copyLabel, MARGIN + logoWidth, 16.5);

  setFont("bold", 10);
  doc.text(business.business_name, A4.width - MARGIN, 9, { align: "right" });
  setFont("normal", 8);
  let sellerMetaY = 13;
  if (business.gstin) {
    doc.text(`GSTIN: ${business.gstin}`, A4.width - MARGIN, sellerMetaY, { align: "right" });
    sellerMetaY += 4;
  }
  if (business.pan) {
    doc.text(`PAN: ${business.pan}`, A4.width - MARGIN, sellerMetaY, { align: "right" });
    sellerMetaY += 4;
  }
  const addressLine = [business.address, business.city, business.state, business.pincode]
    .filter(Boolean)
    .join(", ");
  if (addressLine) {
    const lines: string[] = doc.splitTextToSize(addressLine, 80);
    doc.text(lines, A4.width - MARGIN, sellerMetaY, { align: "right" });
  }

  y = headerHeight + 7;

  /* --------------------------------------------------- seller/customer -- */
  const colWidth = CONTENT_WIDTH / 2 - 3;

  const boxTop = y;
  let boxHeight = 30;

  setDark();
  setFont("bold", 9.5);
  doc.text("Seller", MARGIN, y + 5);
  setFont("normal", 8);
  let cy = y + 10;
  setFont("bold", 8.5);
  doc.text(business.business_name, MARGIN, cy);
  setFont("normal", 8);
  cy += 4;
  if (business.gstin) {
    doc.text(`GSTIN: ${business.gstin}`, MARGIN, cy);
    cy += 3.6;
  }
  const sellerLines: string[] = doc.splitTextToSize(addressLine, colWidth - 4);
  doc.text(sellerLines, MARGIN, cy);
  cy += sellerLines.length * 3.6;
  const sellerContact = [
    business.phone ? `Mobile: ${business.phone}` : null,
    business.email ? `Email: ${business.email}` : null,
    business.website ? `Website: ${business.website}` : null,
  ]
    .filter(Boolean)
    .join("   ");
  if (sellerContact) {
    const contactLines: string[] = doc.splitTextToSize(sellerContact, colWidth - 4);
    doc.text(contactLines, MARGIN, cy);
    cy += contactLines.length * 3.6;
  }
  boxHeight = Math.max(boxHeight, cy - y);

  // customer column
  const rightX = MARGIN + colWidth + 6;
  let ry = y + 5;
  setFont("bold", 9.5);
  doc.text("Customer Details", rightX, ry);
  ry += 5;
  setFont("bold", 8.5);
  const customerName = customer.company_name || customer.name;
  const nameLines: string[] = doc.splitTextToSize(customerName, colWidth - 4);
  doc.text(nameLines, rightX, ry);
  ry += nameLines.length * 3.8;
  setFont("normal", 8);
  if (customer.company_name && customer.company_name !== customer.name) {
    doc.text(`Attn: ${customer.name}`, rightX, ry);
    ry += 3.6;
  }
  if (customer.gstin) {
    doc.text(`GSTIN: ${customer.gstin}`, rightX, ry);
    ry += 3.6;
  }
  const billing = [
    customer.billing_address,
    [customer.city, customer.state].filter(Boolean).join(", "),
    customer.pincode,
  ]
    .filter(Boolean)
    .join(", ");
  const billingLines: string[] = doc.splitTextToSize(billing, colWidth - 4);
  doc.text(billingLines, rightX, ry);
  ry += billingLines.length * 3.6;

  const shippingParts = shippingAddressLines(invoice, customer);
  if (shippingParts.length > 0) {
    const shippingLines: string[] = shippingParts.flatMap((part, index) => {
      const wrapped: string[] = doc.splitTextToSize(part, colWidth - 4);
      if (index === 0) wrapped[0] = `Shipping: ${wrapped[0]}`;
      return wrapped;
    });
    doc.text(shippingLines, rightX, ry);
    ry += shippingLines.length * 3.6;
  }
  const customerContact = [customer.email, customer.phone].filter(Boolean).join("   ");
  if (customerContact) {
    const lines: string[] = doc.splitTextToSize(customerContact, colWidth - 4);
    doc.text(lines, rightX, ry);
    ry += lines.length * 3.6;
  }
  boxHeight = Math.max(boxHeight, ry - y + 2);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, CONTENT_WIDTH, boxHeight);

  y = boxTop + boxHeight + 5;

  /* ------------------------------------------------------- meta strip --- */
  const meta: Array<[string, string]> = [
    ["Invoice #", invoice.invoice_number],
    ["Invoice Date", formatDate(invoice.invoice_date)],
    ["State Code", stateCodeOf(invoice, customer, business)],
    ["Place of Supply", invoice.place_of_supply || customer.place_of_supply || customer.state || "—"],
    ["PO", invoice.reference_number || "—"],
    ["PO Date", invoice.po_date ? formatDate(invoice.po_date) : "—"],
    ["Payment Terms", invoice.payment_terms || "—"],
    ["Supply Type", interstate ? "Inter-state (IGST)" : "Intra-state (CGST/SGST)"],
  ];

  const metaWidth = CONTENT_WIDTH / meta.length;
  const metaHeight = 14;
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, CONTENT_WIDTH, metaHeight, "F");
  meta.forEach(([label, value], index) => {
    const x = MARGIN + metaWidth * index + 2.5;
    setMuted();
    setFont("normal", 6.5);
    doc.text(label, x, y + 5);
    setDark();
    setFont("bold", 7.5);
    const lines: string[] = doc.splitTextToSize(value, metaWidth - 5);
    doc.text(lines.slice(0, 2), x, y + 9);
  });
  y += metaHeight + 6;

  /* ------------------------------------------------------- item table --- */
  const showLineDiscount = items.some((item) => Number(item.discount) > 0);

  const body = items.map((item, index) => [
    String(index + 1),
    {
      content: showLineDiscount
        ? `${item.item_name}${item.description ? ` — ${item.description}` : ""}\nDiscount: ${formatINR(item.discount)}`
        : `${item.item_name}${item.description ? ` — ${item.description}` : ""}`,
      styles: { cellWidth: "auto" },
    },
    item.hsn_sac || "—",
    formatINR(item.rate),
    String(item.quantity),
    item.unit || "PCS",
    formatINR(item.taxable_value),
    `${item.gst_rate}%`,
    formatINR(Number(item.cgst) + Number(item.sgst) + Number(item.igst)),
    formatINR(item.total_amount),
  ]);

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [
      [
        "#",
        "Item / Description",
        "HSN/SAC",
        "Rate",
        "Qty",
        "Unit",
        "Taxable Value",
        "GST %",
        "Tax Amount",
        "Amount",
      ],
    ],
    body: body as unknown as (string | number)[][],
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 4 },
    styles: {
      font: "BillFlow",
      fontSize: 7.5,
      cellPadding: 1.5,
      lineColor: [203, 213, 225],
      lineWidth: 0.1,
      textColor: [17, 24, 39],
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: accent,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 6, halign: "center" },
      1: { cellWidth: 44 },
      2: { cellWidth: 15 },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 12, halign: "right" },
      5: { cellWidth: 12 },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 13, halign: "right" },
      8: { cellWidth: 21, halign: "right" },
      9: { cellWidth: 23, halign: "right", fontStyle: "bold" },
    },
    didDrawPage: () => {
      const pageNo = doc.getNumberOfPages();
      setMuted();
      setFont("normal", 6.5);
      doc.text(
        settings.footer_text ||
          "This is a computer generated document and does not require a signature.",
        MARGIN,
        A4.height - 6,
      );
      doc.text(`Page ${pageNo}`, A4.width - MARGIN, A4.height - 6, { align: "right" });
      setDark();
    },
  });

  const tableFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  y = tableFinalY + 4;

  doc.setDrawColor(15, 23, 42);
  setFont("bold", 8);
  doc.text(
    `Total Items / Qty : ${items.length} / ${totalQuantity}`,
    MARGIN,
    y,
  );
  y += 6;

  /* -------------------------------------------------------- totals ------ */
  // Group tax by slab so the PDF matches the on-screen preview.
  const taxGroups = new Map<number, { cgst: number; sgst: number; igst: number }>();
  for (const item of items) {
    const key = Number(item.gst_rate) || 0;
    const entry = taxGroups.get(key) ?? { cgst: 0, sgst: 0, igst: 0 };
    entry.cgst = Math.round((entry.cgst + Number(item.cgst || 0)) * 100) / 100;
    entry.sgst = Math.round((entry.sgst + Number(item.sgst || 0)) * 100) / 100;
    entry.igst = Math.round((entry.igst + Number(item.igst || 0)) * 100) / 100;
    taxGroups.set(key, entry);
  }
  const orderedRates = [...taxGroups.keys()].sort((a, b) => a - b);

  const totalsRows: Array<{ label: string; value: string; bold?: boolean; fill?: boolean }> = [
    { label: "Taxable Amount", value: formatINR(invoice.taxable_amount) },
  ];
  for (const rate of orderedRates) {
    const entry = taxGroups.get(rate)!;
    if (interstate) {
      totalsRows.push({ label: `IGST ${rate}%`, value: formatINR(entry.igst) });
    } else {
      totalsRows.push({ label: `CGST ${rate}%`, value: formatINR(entry.cgst) });
      totalsRows.push({ label: `SGST ${rate}%`, value: formatINR(entry.sgst) });
    }
  }
  if (Number(invoice.cess) > 0) totalsRows.push({ label: "Cess", value: formatINR(invoice.cess) });
  if (Number(invoice.discount) > 0)
    totalsRows.push({ label: "Discount", value: `- ${formatINR(invoice.discount)}` });
  if (Number(invoice.round_off) !== 0)
    totalsRows.push({ label: "Round Off", value: formatINR(invoice.round_off) });
  totalsRows.push({ label: "Total", value: formatINR(invoice.grand_total), bold: true, fill: true });
  totalsRows.push({ label: "Amount Paid", value: formatINR(invoice.amount_paid) });
  totalsRows.push({ label: "Amount Payable", value: formatINR(invoice.balance_due ?? invoice.grand_total), bold: true });

  const rowHeight = 5;
  const totalsHeight = totalsRows.length * rowHeight + 4;
  y = ensureSpace(doc, y, totalsHeight + 34);

  const totalsWidth = 92;
  const totalsX = A4.width - MARGIN - totalsWidth;

  // left column: amount in words + tax summary note
  const wordsWidth = CONTENT_WIDTH - totalsWidth - 6;
  setFont("bold", 8);
  doc.text("Total amount (in words):", MARGIN, y + 4);
  setFont("normal", 8.5);
  const words: string[] = doc.splitTextToSize(amountInWords(invoice.grand_total), wordsWidth);
  doc.text(words, MARGIN, y + 9);
  const leftHeight = Math.max(24, words.length * 4.2 + 12);

  // totals box
  let ty = y;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.setFillColor(255, 255, 255);
  doc.rect(totalsX, ty, totalsWidth, totalsHeight, "S");

  for (const row of totalsRows) {
    if (row.fill) {
      doc.setFillColor(240, 253, 244);
      doc.rect(totalsX, ty, totalsWidth, rowHeight, "F");
      doc.setDrawColor(203, 213, 225);
      doc.line(totalsX, ty, totalsX + totalsWidth, ty);
    }
    setFont(row.bold ? "bold" : "normal", 8);
    setDark();
    doc.text(row.label, totalsX + 3, ty + 3.4);
    doc.text(row.value, totalsX + totalsWidth - 3, ty + 3.4, { align: "right" });
    ty += rowHeight;
  }

  doc.setDrawColor(15, 23, 42);
  doc.line(totalsX, y + totalsHeight - rowHeight - 4, totalsX + totalsWidth, y + totalsHeight - rowHeight - 4);

  y = y + Math.max(leftHeight, totalsHeight) + 6;

  /* --------------------------------------------- bank + authorisation --- */
  y = ensureSpace(doc, y, 44);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, A4.width - MARGIN, y);
  y += 5;

  let bankY: number | undefined;
  if (settings.show_bank_details && (settings.bank_name || settings.account_number)) {
    setFont("bold", 8);
    doc.text("Bank Details:", MARGIN, y);
    setFont("normal", 8);
    bankY = y + 4.5;
    const bankLines = [
      settings.bank_name ? `Bank: ${settings.bank_name}` : null,
      settings.account_holder ? `Account Holder: ${settings.account_holder}` : null,
      settings.account_number ? `Account #: ${settings.account_number}` : null,
      settings.ifsc_code ? `IFSC Code: ${settings.ifsc_code}` : null,
      settings.branch ? `Branch: ${settings.branch}` : null,
    ].filter(Boolean) as string[];
    for (const line of bankLines) {
      doc.text(line, MARGIN, bankY);
      bankY += 4;
    }
  }

  const sigY = y + 26;
  setFont("bold", 8);
  doc.text(`For ${business.business_name}`, A4.width - MARGIN, y + 4, { align: "right" });
  doc.setDrawColor(100, 116, 139);
  doc.line(A4.width - MARGIN - 60, sigY, A4.width - MARGIN, sigY);
  setFont("normal", 8);
  doc.text(
    settings.authorized_signatory || settings.signature_text || "Authorized Signatory",
    A4.width - MARGIN,
    sigY + 4,
    { align: "right" },
  );

  y = Math.max(bankY ?? y, sigY + 12) + 2;

  /* -------------------------------------------------- terms + notes ----- */
  const terms = invoice.terms || settings.default_terms || "";
  if (terms.trim()) {
    y = ensureSpace(doc, y, 20);
    setFont("bold", 8);
    doc.text("Terms & Conditions:", MARGIN, y);
    setFont("normal", 7.5);
    const termLines: string[] = doc.splitTextToSize(terms.replace(/\n+/g, "  "), CONTENT_WIDTH);
    const shown = termLines.slice(0, 6);
    doc.text(shown, MARGIN, y + 4.5);
    y += shown.length * 3.4 + 6;
  }

  if (invoice.notes) {
    y = ensureSpace(doc, y, 14);
    setFont("bold", 8);
    doc.text("Notes:", MARGIN, y);
    setFont("normal", 7.5);
    const noteLines: string[] = doc.splitTextToSize(invoice.notes, CONTENT_WIDTH);
    doc.text(noteLines.slice(0, 4), MARGIN, y + 4.5);
    y += noteLines.slice(0, 4).length * 3.4 + 6;
  }

  /* -------------------------------------------------------- footer ------ */
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    setMuted();
    setFont("normal", 6.5);
    if (page === 1) {
      // keep the autoTable footer; just ensure consistency on later pages
    }
    doc.text(
      settings.footer_text ||
        "This is a computer generated document and does not require a signature.",
      MARGIN,
      A4.height - 6,
    );
    doc.text(`Page ${page} / ${pages}`, A4.width - MARGIN, A4.height - 6, { align: "right" });
    setDark();
  }

  return doc;
}

export function invoiceFileName(invoiceNumber: string): string {
  return `${invoiceNumber.replace(/[^A-Za-z0-9-_]/g, "_")}.pdf`;
}

/** Triggers a browser download of the invoice PDF. */
export function downloadInvoicePdf(detail: InvoiceDetail, options: PdfOptions = {}): void {
  const doc = buildInvoicePdf(detail, options);
  doc.save(options.fileName || invoiceFileName(detail.invoice.invoice_number));
}

/** Opens the invoice PDF in a new tab (preview). Returns false when blocked. */
export function previewInvoicePdf(detail: InvoiceDetail, options: PdfOptions = {}): string | null {
  try {
    const doc = buildInvoicePdf(detail, options);
    const blob = doc.output("bloburl");
    const url = blob.toString();
    const win = window.open(url, "_blank");
    return win ? url : null;
  } catch {
    return null;
  }
}
