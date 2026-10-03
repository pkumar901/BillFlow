import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { INTER_BOLD_BASE64, INTER_REGULAR_BASE64 } from "./fontData";
import { amountInWords, formatDate, formatINR } from "@/lib/format";
import type { CopyLabel } from "@/components/invoices/invoiceShared";
import { shippingAddressLines, stateCodeOf } from "@/components/invoices/invoiceShared";
import type { InvoiceDetail } from "~shared/types";

/**
 * "Standard" invoice PDF - the print-ready twin of <StandardInvoice />.
 *
 * Same information architecture as the reference invoice: bordered sheet,
 * centred TAX INVOICE title with the copy label on the right, seller logo and
 * details next to a ruled meta grid, customer details underneath, a fully ruled
 * item table, a right-aligned totals block anchored above the bank section,
 * amount in words + amount payable, bank details beside the authorisation
 * block, then a compact footer. All colours come from the invoice settings -
 * no third-party branding or reference data is used.
 */

const A4 = { width: 210, height: 297 };

/* sheet geometry (mm) ----------------------------------------------------- */
const FX = 8.5; // frame left
const FR = 201.5; // frame right
const FT = 8.5; // frame top
const FOOTER_BOTTOM = 280; // default frame bottom (matches the reference sheet)
const FRAME_MAX = 283; // never draw the frame past this - two lines sit below it
const FOOTER_STRIP = 3.4; // footer cell height inside the frame

const PX = 10.5; // text inset (left)
const PR = 199.5; // text inset (right)
const CW = PR - PX; // 189
const MID = 105; // seller | meta divider
const SUB = 153.25; // meta sub-column divider
const BANK_DIV = 137.7; // bank | signature divider
const LABEL_RIGHT = 158.5; // right edge of totals labels

const DARK: [number, number, number] = [29, 29, 31];
const GREY: [number, number, number] = [81, 81, 84]; // #515154 - the reference's soft grey

/** Table column widths (mm) measured off the reference invoice. */
const TABLE_COLUMNS: Array<{ width: number; align: "left" | "right"; bold?: boolean }> = [
  { width: 8.54, align: "left" },
  { width: 55.6, align: "left" },
  { width: 17.07, align: "right" },
  { width: 25.65, align: "right" },
  { width: 19.26, align: "right" },
  { width: 21.34, align: "right" },
  { width: 23.53, align: "right" },
  { width: 21.38, align: "right", bold: true },
];

const TABLE_LEFT = FX + 0.4;
const TABLE_WIDTH = TABLE_COLUMNS.reduce((sum, col) => sum + col.width, 0);
/** x positions of every table column boundary (first entry is the left edge). */
const TABLE_BOUNDS: number[] = TABLE_COLUMNS.reduce<number[]>(
  (acc, col) => [...acc, acc[acc.length - 1] + col.width],
  [TABLE_LEFT],
);

export interface StandardPdfOptions {
  copyLabel?: CopyLabel;
  fileName?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || "#0f766e").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = Number.parseInt(full.slice(0, 6) || "0f766e", 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function buildStandardInvoicePdf(
  detail: InvoiceDetail,
  options: StandardPdfOptions = {},
): jsPDF {
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
  const setDark = () => doc.setTextColor(...DARK);
  const setMuted = () => doc.setTextColor(...GREY);

  const rule = (x1: number, y: number, x2: number, width = 0.5) => {
    doc.setDrawColor(...DARK);
    doc.setLineWidth(width);
    doc.line(x1, y, x2, y);
  };
  const vrule = (x: number, y1: number, y2: number, width = 0.35) => {
    if (y2 - y1 <= 0) return;
    doc.setDrawColor(...DARK);
    doc.setLineWidth(width);
    doc.line(x, y1, x, y2);
  };

  /** Remembers how much vertical space each page actually used. */
  const pageBottoms: number[] = [];
  const mark = (yy: number) => {
    const page = doc.getCurrentPageInfo().pageNumber;
    pageBottoms[page] = Math.max(pageBottoms[page] ?? FT + 12, yy);
  };

  const lines = (text: string, width: number): string[] => {
    const out = doc.splitTextToSize(text, width);
    return Array.isArray(out) ? (out as string[]) : [String(out)];
  };

  /* ---------------------------------------------------------- title ----- */
  const titleRuleY = FT + 6.8;
  setFont("bold", 9.9);
  doc.setTextColor(...accent);
  doc.text((settings.invoice_title || "TAX INVOICE").toUpperCase(), A4.width / 2, FT + 4.4, {
    align: "center",
  });
  setFont("bold", 7.2);
  doc.setTextColor(51, 51, 51);
  doc.text(copyLabel.toUpperCase(), PR, FT + 4.3, { align: "right" });
  rule(FX, titleRuleY, FR, 0.7);
  mark(titleRuleY);

  /* ------------------------------------------------- seller | meta grid - */
  const gridTop = titleRuleY;
  let y = gridTop;

  // seller (left of the divider)
  let ly = gridTop + 1.6;
  let sellerX = PX;
  if (business.logo_url) {
    try {
      const format = business.logo_url.includes("image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(business.logo_url, format, PX, ly, 24, 16, undefined, "FAST");
      sellerX = PX + 28;
    } catch {
      sellerX = PX; // never fail the PDF because of a logo
    }
  }

  const sellerWidth = MID - 4 - sellerX;
  let sy = gridTop + 4.7;
  setDark();
  setFont("bold", 9.9);
  doc.text(business.business_name, sellerX, sy);
  sy += 5.1;
  setFont("bold", 8.1);
  if (business.gstin) {
    doc.text(`GSTIN: ${business.gstin}`, sellerX, sy);
    sy += 3.6;
  }
  if (business.pan) {
    doc.text(`PAN: ${business.pan}`, sellerX, sy);
    sy += 3.6;
  }
  setFont("normal", 8.1);
  const sellerAddress = [
    business.address,
    [business.city, business.state].filter(Boolean).join(", ") || null,
    business.pincode || null,
  ]
    .filter(Boolean)
    .join(", ");
  for (const line of lines(sellerAddress, sellerWidth)) {
    doc.text(line, sellerX, sy);
    sy += 3.6;
  }
  const sellerContact = [
    business.phone ? `Mobile: ${business.phone}` : null,
    business.email ? `Email: ${business.email}` : null,
    business.website ? `Web: ${business.website}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  for (const entry of sellerContact) {
    for (const line of lines(entry, sellerWidth)) {
      doc.text(line, sellerX, sy);
      sy += 3.6;
    }
  }
  const sellerBottom = sy + 1.5;

  const leftRuleY = sellerBottom;
  rule(FX, leftRuleY, MID, 0.5);

  // customer details (spans the left half)
  let cy = leftRuleY + 4.15;
  setDark();
  setFont("bold", 8.1);
  doc.text("Customer Details:", PX, cy);
  cy += 3.7;
  setFont("bold", 8.1);
  const customerName = customer.company_name || customer.name;
  for (const line of lines(customerName, MID - 4 - PX)) {
    doc.text(line, PX, cy);
    cy += 3.6;
  }
  setFont("normal", 8.1);
  if (customer.company_name && customer.company_name !== customer.name) {
    doc.text(`Attn: ${customer.name}`, PX, cy);
    cy += 3.6;
  }
  if (customer.gstin) {
    setFont("bold", 8.1);
    doc.text(`GSTIN: ${customer.gstin}`, PX, cy);
    setFont("normal", 8.1);
    cy += 3.6;
  }
  setFont("bold", 8.1);
  doc.text("Billing Address:", PX, cy);
  setFont("normal", 8.1);
  cy += 3.6;
  const billing = [
    customer.billing_address,
    [customer.city, customer.state].filter(Boolean).join(", ") || null,
    customer.pincode ?? null,
  ]
    .filter(Boolean)
    .join(", ");
  for (const line of lines(billing, MID - 4 - PX)) {
    doc.text(line, PX, cy);
    cy += 3.6;
  }
  for (const entry of [customer.email, customer.phone].filter((v): v is string => Boolean(v))) {
    doc.text(entry, PX, cy);
    cy += 3.6;
  }
  const leftBottom = cy + 1.5;

  // meta grid (right of the divider)
  const metaLabel = (label: string, value: string, colX: number, rowTop: number) => {
    setDark();
    setFont("bold", 8.1);
    doc.text(label, colX, rowTop + 4.15);
    doc.text(value, colX, rowTop + 8.56);
  };

  const rowA = gridTop;
  metaLabel("Invoice #:", invoice.invoice_number, MID + 1.6, rowA);
  metaLabel("Invoice Date:", formatDate(invoice.invoice_date), SUB + 1.5, rowA);
  rule(MID, rowA + 11.5, FR, 0.5);

  const rowB = rowA + 11.5;
  const placeOfSupply = invoice.place_of_supply || customer.place_of_supply || customer.state || "—";
  metaLabel("Place of Supply:", placeOfSupply, MID + 1.6, rowB);
  metaLabel("State Code:", stateCodeOf(invoice, customer, business), SUB + 1.5, rowB);
  rule(MID, rowB + 11.6, FR, 0.5);
  vrule(SUB, rowA, rowB, 0.5);

  let ry = rowB + 11.6;
  const shippingParts = shippingAddressLines(invoice, customer);

  if (shippingParts.length > 0) {
    setDark();
    setFont("bold", 8.1);
    doc.text("Shipping Address:", MID + 1.6, ry + 3.8);
    setFont("normal", 8.1);
    ry += 7.4;
    for (const part of shippingParts) {
      for (const line of lines(part, FR - 1.5 - (MID + 1.6))) {
        doc.text(line, MID + 1.6, ry);
        ry += 3.6;
      }
    }
    ry += 1.4;
  }

  setDark();
  setFont("bold", 8.1);
  doc.text("Reference:", MID + 1.6, ry + 3.4);
  const referenceX = MID + 1.6 + doc.getTextWidth("Reference:") + 2.5;
  setFont("normal", 8.1);
  doc.text(invoice.reference_number || "—", referenceX, ry + 3.4);
  ry += 6.6;
  if (invoice.payment_terms) {
    setFont("bold", 8.1);
    doc.text("Payment Terms:", MID + 1.6, ry + 3.4);
    const termsX = MID + 1.6 + doc.getTextWidth("Payment Terms:") + 2.5;
    setFont("normal", 8.1);
    doc.text(invoice.payment_terms, termsX, ry + 3.4);
    ry += 6.6;
  }
  const rightBottom = ry + 3;

  const gridBottom = Math.max(leftBottom, rightBottom);
  rule(FX, gridBottom, FR, 0.7);
  mark(gridBottom);
  y = gridBottom;

  /* ------------------------------------------------------- item table --- */
  const tableBody = items.map((item, index) => {
    const tax = Number(item.cgst) + Number(item.sgst) + Number(item.igst);
    const name = [
      item.item_name,
      item.description,
      Number(item.discount) > 0 ? `Discount: ${formatINR(item.discount)}` : null,
    ]
      .filter(Boolean)
      .join(" — ");
    return [
      String(index + 1),
      name,
      item.hsn_sac || "—",
      formatINR(item.rate),
      `${item.quantity} ${item.unit || "PCS"}`,
      formatINR(item.taxable_value),
      `${formatINR(tax)} (${item.gst_rate}%)`,
      formatINR(item.total_amount),
    ];
  });

  const columnStyles: {
    [key: string]: { cellWidth: number; halign: "left" | "right"; fontStyle?: "bold" };
  } = {};
  TABLE_COLUMNS.forEach((col, index) => {
    columnStyles[index] = {
      cellWidth: col.width,
      halign: col.align,
      ...(col.bold ? { fontStyle: "bold" as const } : {}),
    };
  });

  autoTable(doc, {
    startY: y,
    head: [
      ["#", "Item", "HSN/SAC", "Rate / Item", "Qty", "Taxable Value", "Tax Amount", "Amount"],
    ],
    body: tableBody as unknown as (string | number)[][],
    theme: "plain",
    margin: {
      left: TABLE_LEFT,
      right: A4.width - (TABLE_LEFT + TABLE_WIDTH),
      top: FT + 3,
      bottom: 14,
    },
    styles: {
      font: "BillFlow",
      fontSize: 8.1,
      cellPadding: { top: 1.1, right: 1.59, bottom: 1.1, left: 1.59 },
      lineColor: DARK,
      lineWidth: 0.35,
      textColor: [20, 20, 20],
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: DARK,
      fontStyle: "bold",
      fontSize: 7.1,
      cellPadding: { top: 1.5, right: 1.59, bottom: 1.5, left: 1.59 },
      lineWidth: 0.35,
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles,
    didDrawCell: (data) => {
      const page = doc.getCurrentPageInfo().pageNumber;
      pageBottoms[page] = Math.max(pageBottoms[page] ?? FT + 12, data.cell.y + data.cell.height);

      // the reference table is ruled vertically only: column dividers run from
      // the header down through every row, with no line between the rows
      const top = data.cell.y;
      const bottom = data.cell.y + data.cell.height;
      if (data.column.index > 0) vrule(data.cell.x, top, bottom, 0.35);
      if (data.column.index === TABLE_COLUMNS.length - 1) {
        vrule(data.cell.x + data.cell.width, top, bottom, 0.35);
      }
      // heavier rule under the header row, like the reference table
      if (data.section === "head" && data.row.index === 0) {
        rule(data.cell.x, bottom, data.cell.x + data.cell.width, 0.7);
      }
    },
  });

  const tableEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const tablePage = doc.getCurrentPageInfo().pageNumber;
  mark(tableEnd);
  y = tableEnd;

  /* ---------------------------------------------------------- totals ---- */
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

  const taxRows: Array<{ label: string; value: string }> = [
    { label: "Taxable Amount", value: formatINR(invoice.taxable_amount) },
  ];
  for (const rate of orderedRates) {
    const entry = taxGroups.get(rate)!;
    if (interstate) {
      taxRows.push({ label: `IGST ${rate}%`, value: formatINR(entry.igst) });
    } else {
      taxRows.push({ label: `CGST ${rate}%`, value: formatINR(entry.cgst) });
      taxRows.push({ label: `SGST ${rate}%`, value: formatINR(entry.sgst) });
    }
  }
  if (Number(invoice.cess) > 0) taxRows.push({ label: "Cess", value: formatINR(invoice.cess) });
  if (Number(invoice.discount) > 0)
    taxRows.push({ label: "Discount", value: `- ${formatINR(invoice.discount)}` });
  if (Number(invoice.round_off) !== 0)
    taxRows.push({ label: "Round Off", value: formatINR(invoice.round_off) });

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const rowH = 4.23; // reference summary rows are 12pt tall
  const bandH = 4.6;
  const totalH = 6.35;
  const payableH = 4.62;

  setFont("normal", 8);
  const wordsText = `Total amount (in words): ${amountInWords(invoice.grand_total)}`;
  const words = lines(wordsText, CW - 6);
  const wordsH = Math.max(3.7, words.length * 3.6);

  const summaryH =
    bandH + taxRows.length * rowH + totalH + wordsH + payableH;
  const bankH = 30.3;
  const terms = invoice.terms || settings.default_terms || "";
  const termLines = terms.trim() ? lines(terms.replace(/\n+/g, "  "), CW - 4).slice(0, 6) : [];
  const notesLines = invoice.notes ? lines(invoice.notes, CW - 4).slice(0, 4) : [];
  // each block draws a 4.4mm lead-in gap, its lines, then a 6mm tail
  const termH = termLines.length ? termLines.length * 3.6 + 10.4 : 0;
  const notesH = notesLines.length ? notesLines.length * 3.6 + 10.4 : 0;
  const reserve = summaryH + bankH + termH + notesH + FOOTER_STRIP;

  const naturalY = y + 2;
  const anchorY = 214.1; // where the reference totals block starts
  let startY = Math.max(naturalY, Math.min(anchorY, FOOTER_BOTTOM - reserve));
  if (startY + reserve > FRAME_MAX) {
    doc.addPage();
    startY = FT + 3;
  }
  y = startY;

  // the column dividers keep running through the empty area down to the totals
  if (doc.getCurrentPageInfo().pageNumber === tablePage) {
    for (let index = 1; index < TABLE_BOUNDS.length; index += 1) {
      vrule(TABLE_BOUNDS[index], tableEnd, startY, 0.35);
    }
  }

  rule(FX, y, FR, 0.35);

  // band: total items / qty
  setDark();
  setFont("normal", 7.5);
  doc.text(`Total Items / Qty : ${items.length} / ${totalQuantity}`, PX, y + 2.9);
  y += bandH;
  rule(FX, y, FR, 0.35);

  // tax rows (right aligned in two columns)
  for (const row of taxRows) {
    setDark();
    setFont("bold", 7.9);
    doc.text(row.label, LABEL_RIGHT, y + 2.8, { align: "right" });
    doc.text(row.value, PR, y + 2.8, { align: "right" });
    y += rowH;
  }
  rule(FX, y, FR, 0.35);

  // grand total
  setDark();
  setFont("bold", 12);
  doc.text("Total", PX, y + 4.1);
  setFont("bold", 12.6);
  doc.text(formatINR(invoice.grand_total), PR, y + 4.1, { align: "right" });
  y += totalH;
  rule(FX, y, FR, 0.5);

  // amount in words
  setDark();
  setFont("normal", 8);
  doc.text(words, PX, y + 3.4);
  y += wordsH;
  rule(FX, y, FR, 0.35);

  // amount payable
  setMuted();
  setFont("bold", 9);
  doc.text("Amount Payable:", LABEL_RIGHT, y + 4.3, { align: "right" });
  doc.text(formatINR(invoice.balance_due ?? invoice.grand_total), PR, y + 4.3, {
    align: "right",
  });
  y += payableH;
  mark(y);

  /* ------------------------------------------------ bank + signature ---- */
  rule(FX, y, FR, 0.5);
  const bankTop = y;
  const headingY = bankTop + 4.4;
  setDark();
  setFont("bold", 8.1);
  doc.text("Bank Details:", PX, headingY);

  let lastBankY = headingY;
  if (settings.show_bank_details && (settings.bank_name || settings.account_number)) {
    const bankRows: Array<[string, string]> = [];
    if (settings.bank_name) bankRows.push(["Bank:", settings.bank_name]);
    if (settings.account_holder) bankRows.push(["Account Holder:", settings.account_holder]);
    if (settings.account_number) bankRows.push(["Account #:", settings.account_number]);
    if (settings.ifsc_code) bankRows.push(["IFSC Code:", settings.ifsc_code]);
    if (settings.branch) bankRows.push(["Branch:", settings.branch]);
    let bankY = bankTop + 9;
    for (const [label, value] of bankRows) {
      setDark();
      setFont("normal", 8.8);
      doc.text(label, PX, bankY);
      setFont("bold", 8.8);
      doc.text(value, 43.6, bankY);
      bankY += 4.36;
    }
    lastBankY = bankY - 4.36;
    mark(bankY);
  }

  // authorisation block: "For …" at the top, signatory caption at the bottom
  setDark();
  setFont("normal", 6.6);
  doc.text(`For ${business.business_name}`, PR, bankTop + 3.96, { align: "right" });
  const sigY = bankTop + 26;
  const signatory = settings.authorized_signatory || settings.signature_text || "";
  if (signatory) {
    doc.text(signatory, PR, sigY - 4.2, { align: "right" });
  }
  doc.setTextColor(51, 51, 51);
  doc.text("Authorized Signatory", PR, sigY, { align: "right" });

  const bankBottomY = Math.max(bankTop + bankH, lastBankY + 2.6, sigY + 2.6);
  vrule(BANK_DIV, bankTop + 0.3, bankBottomY, 0.5);
  y = bankBottomY;
  rule(FX, y, FR, 0.5);
  mark(y);

  /* ------------------------------------------------ notes + terms ------- */
  if (termLines.length) {
    y += 4.4;
    setDark();
    setFont("bold", 8.1);
    doc.text("Terms & Conditions:", PX, y);
    setFont("normal", 8.1);
    doc.text(termLines, PX, y + 4.6);
    y += termLines.length * 3.6 + 6;
    rule(FX, y, FR, 0.35);
    mark(y);
  }

  if (notesLines.length) {
    y += 4.4;
    setDark();
    setFont("bold", 8.1);
    doc.text("Notes:", PX, y);
    setFont("normal", 8.1);
    doc.text(notesLines, PX, y + 4.6);
    y += notesLines.length * 3.6 + 6;
    rule(FX, y, FR, 0.35);
    mark(y);
  }

  mark(y);

  /* --------------------------------------------- frame + footer -------- */
  const footerText = (settings.footer_text || "").trim();
  const pages = doc.getNumberOfPages();
  const footerDivider = FX + (FR - FX) * 0.453;

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    const bottom = Math.min(
      Math.max(FOOTER_BOTTOM, (pageBottoms[page] ?? FOOTER_BOTTOM) + FOOTER_STRIP),
      FRAME_MAX,
    );

    // footer strip: a rule across the sheet and a divider at ~45% of the width
    const footerRuleY = bottom - FOOTER_STRIP;
    rule(FX, footerRuleY, FR, 0.5);
    vrule(footerDivider, footerRuleY, bottom, 0.5);
    setDark();
    setFont("normal", 8.1);
    doc.text("Powered by BillFlow", PR, bottom - 1, { align: "right" });

    doc.setDrawColor(...DARK);
    doc.setLineWidth(0.7);
    doc.rect(FX, FT, FR - FX, bottom - FT, "S");
    pageBottoms[page] = bottom;

    // two closing lines below the frame
    let lineY = bottom + 3.87;
    if (footerText) {
      setFont("bold", 9);
      doc.setTextColor(...accent);
      doc.text(footerText, FX, lineY);
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.18);
      doc.line(FX, lineY + 0.56, FX + doc.getTextWidth(footerText), lineY + 0.56);
      lineY = bottom + 7.3;
    } else {
      lineY = bottom + 4.2;
    }

    setDark();
    setFont("normal", 8.1);
    doc.text(
      `Page ${page} / ${pages}   •   This is a computer generated document and requires no signature.`,
      FX,
      lineY,
    );
    setDark();
  }

  return doc;
}
