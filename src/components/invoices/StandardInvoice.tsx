import { amountInWords, formatDate, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addressLines, groupTaxes, shippingAddressLines, type CopyLabel } from "./invoiceShared";
import type { InvoiceDetail } from "~shared/types";

/**
 * "Standard" invoice layout.
 *
 * Mirrors the reference invoice's ruled-sheet design: a bordered sheet with a
 * centred title and the copy label on the right, a ruled seller / meta /
 * customer grid, an item table whose column dividers run down through the empty
 * area, a right-aligned totals stack, amount in words, bank details beside the
 * authorisation block, a footer strip inside the frame and two closing lines
 * below it.
 *
 * Colours follow the invoice accent setting - no third-party branding.
 */

/** Column widths measured off the reference invoice (they sum to 100%). */
const COL_WIDTHS = [
  "4.44%",
  "28.9%",
  "8.88%",
  "13.33%",
  "10.01%",
  "11.1%",
  "12.23%",
  "11.11%",
];

export function StandardInvoice({
  detail,
  copyLabel = "Original for Recipient",
  showBalance = true,
  className,
}: {
  detail: InvoiceDetail;
  copyLabel?: CopyLabel;
  showBalance?: boolean;
  className?: string;
}) {
  const { invoice, items, customer, business, settings } = detail;
  const accent = settings.accent_color || "#0f766e";
  const interstate = Boolean(invoice.interstate);

  const sellerAddress = addressLines([
    business.address,
    [business.city, business.state].filter(Boolean).join(", ") || null,
    business.pincode || null,
  ]);

  const billingAddress = addressLines([
    customer.billing_address,
    [customer.city, customer.state].filter(Boolean).join(", ") || null,
    customer.pincode ?? null,
  ]);

  const shippingAddress = shippingAddressLines(invoice, customer);
  const showShipping = shippingAddress.length > 0;

  const taxGroups = groupTaxes(items, interstate);
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalDiscount = invoice.discount ?? 0;
  const cess = Number(invoice.cess ?? 0);
  const roundOff = Number(invoice.round_off ?? 0);

  const placeOfSupply = invoice.place_of_supply || customer.place_of_supply || customer.state || "—";
  const signatory = settings.authorized_signatory || settings.signature_text || "";
  const footerText = (settings.footer_text || "").trim();

  const metaCell = (label: string, value: string) => (
    <div className="px-1.5 py-1.5">
      <div className="text-[10.8px] font-semibold leading-4">{label}</div>
      <div className="text-[10.8px] font-bold leading-4">{value}</div>
    </div>
  );

  return (
    <article
      className={cn("invoice-sheet invoice-sheet--standard", className)}
      style={{ ["--invoice-accent" as string]: accent }}
      data-invoice-sheet
    >
      <div className="flex min-h-[270mm] flex-col border-[2.67px] border-neutral-900 text-neutral-900">
        {/* ------------------------------------------------------ title --- */}
        <header className="flex items-center border-b-[2.67px] border-neutral-900 px-1.5 py-1">
          <span className="w-1/3" />
          <h1
            className="w-1/3 text-center text-[13px] font-bold uppercase leading-[1.2] tracking-[0.18em]"
            style={{ color: accent }}
          >
            {settings.invoice_title || "TAX INVOICE"}
          </h1>
          <span className="w-1/3 text-right text-[9.5px] font-semibold uppercase leading-[1.2] tracking-wide text-neutral-600">
            {copyLabel}
          </span>
        </header>

        {/* -------------------------------------- seller + meta + customer - */}
        <div className="grid grid-cols-2 border-b-[2.67px] border-neutral-900">
          <div className="border-r-[1.92px] border-neutral-900">
            <div className="flex items-start gap-3 px-1.5 py-2">
              {business.logo_url && (
                <img
                  src={business.logo_url}
                  alt={`${business.business_name} logo`}
                  className="h-[22mm] w-[24mm] shrink-0 object-contain"
                />
              )}
              <div className="text-[10.8px] leading-[13.5px]">
                <div className="text-[13px] font-bold leading-4">{business.business_name}</div>
                {business.gstin && <div className="font-semibold">GSTIN: {business.gstin}</div>}
                {business.pan && <div className="font-semibold">PAN: {business.pan}</div>}
                {sellerAddress.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {business.phone && <div>Mobile: {business.phone}</div>}
                {business.email && <div>Email: {business.email}</div>}
                {business.website && <div>Web: {business.website}</div>}
              </div>
            </div>

            <div className="border-t-[1.92px] border-neutral-900 px-1.5 py-2 text-[10.8px] leading-[13.5px]">
              <div className="font-semibold">Customer Details:</div>
              <div className="font-bold">{customer.company_name || customer.name}</div>
              {customer.company_name && customer.company_name !== customer.name && (
                <div>Attn: {customer.name}</div>
              )}
              {customer.gstin && <div className="font-semibold">GSTIN: {customer.gstin}</div>}
              <div className="font-semibold">Billing Address:</div>
              {billingAddress.map((line) => (
                <div key={line}>{line}</div>
              ))}
              {customer.email && <div>{customer.email}</div>}
              {customer.phone && <div>{customer.phone}</div>}
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 border-b-[1.92px] border-neutral-900">
              <div className="border-r-[1.92px] border-neutral-900">
                {metaCell("Invoice #:", invoice.invoice_number)}
              </div>
              {metaCell("Invoice Date:", formatDate(invoice.invoice_date))}
            </div>

            <div className="grid grid-cols-2 border-b-[1.92px] border-neutral-900">
              <div className="border-r-[1.92px] border-neutral-900">
                {metaCell("Place of Supply:", placeOfSupply)}
              </div>
              <div className="grid grid-cols-2">
                <div className="border-r-[1.92px] border-neutral-900">
                  {metaCell("PO No:", invoice.reference_number || "")}
                </div>
                {metaCell("PO Date:", invoice.po_date ? formatDate(invoice.po_date) : "")}
              </div>
            </div>

            <div className="px-1.5 py-2 text-[10.8px] leading-[13.5px]">
              {showShipping && (
                <div className="mb-1.5">
                  <div className="font-semibold">Shipping Address:</div>
                  {shippingAddress.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              )}
              {invoice.payment_terms && (
                <div>
                  <span className="font-semibold">Payment Terms: </span>
                  {invoice.payment_terms}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------- item table --- */}
        <div className="flex grow flex-col">
          <table className="w-full table-fixed border-collapse text-[10.8px] leading-[13.5px]">
            <colgroup>
              {COL_WIDTHS.map((width) => (
                <col key={width} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b-[2.67px] border-neutral-900 text-[9.5px] font-semibold leading-[11px]">
                <th className="border-r-[1.33px] border-neutral-900 px-1.5 py-[5px] text-left">#</th>
                <th className="border-r-[1.33px] border-neutral-900 px-1.5 py-[5px] text-left">Item</th>
                <th className="border-r-[1.33px] border-neutral-900 px-1.5 py-[5px] text-right">HSN/SAC</th>
                <th className="border-r-[1.33px] border-neutral-900 px-1.5 py-[5px] text-right">Rate / Item</th>
                <th className="border-r-[1.33px] border-neutral-900 px-1.5 py-[5px] text-right">Qty</th>
                <th className="border-r-[1.33px] border-neutral-900 px-1.5 py-[5px] text-right">Taxable Value</th>
                <th className="border-r-[1.33px] border-neutral-900 px-1.5 py-[5px] text-right">Tax Amount</th>
                <th className="border-r-[1.33px] border-neutral-900 px-1.5 py-[5px] text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const tax = Number(item.cgst) + Number(item.sgst) + Number(item.igst);
                return (
                  <tr key={item.id ?? index}>
                    <td className="border-r-[1.33px] border-neutral-900 px-1.5 py-1 align-top">{index + 1}</td>
                    <td className="border-r-[1.33px] border-neutral-900 px-1.5 py-1 align-top">
                      <div className="font-semibold">{item.item_name}</div>
                      {item.description && (
                        <div className="text-[9.5px] leading-3 text-neutral-500">{item.description}</div>
                      )}
                      {Number(item.discount) > 0 && (
                        <div className="text-[9.5px] leading-3 text-neutral-500">
                          Discount: {formatINR(item.discount)}
                        </div>
                      )}
                    </td>
                    <td className="border-r-[1.33px] border-neutral-900 px-1.5 py-1 text-right align-top">
                      {item.hsn_sac || "—"}
                    </td>
                    <td className="border-r-[1.33px] border-neutral-900 px-1.5 py-1 text-right align-top">
                      {formatINR(item.rate)}
                    </td>
                    <td className="border-r-[1.33px] border-neutral-900 px-1.5 py-1 text-right align-top">
                      {item.quantity} {item.unit || "PCS"}
                    </td>
                    <td className="border-r-[1.33px] border-neutral-900 px-1.5 py-1 text-right align-top">
                      {formatINR(item.taxable_value)}
                    </td>
                    <td className="border-r-[1.33px] border-neutral-900 px-1.5 py-1 text-right align-top">
                      {formatINR(tax)} ({item.gst_rate}%)
                    </td>
                    <td className="border-r-[1.33px] border-neutral-900 px-1.5 py-1 text-right align-top font-semibold">
                      {formatINR(item.total_amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* column dividers continue through the empty area below the rows */}
          <div className="grid grow" style={{ gridTemplateColumns: COL_WIDTHS.join(" ") }}>
            {COL_WIDTHS.map((width, index) => (
              <div
                key={width}
                className={cn(
                  index > 0 && "border-l-[1.33px] border-neutral-900",
                  index === COL_WIDTHS.length - 1 && "border-r-[1.33px] border-neutral-900",
                )}
              />
            ))}
          </div>
        </div>

        {/* ---------------------------------------------------- totals ---- */}
        <section className="border-t-[1.33px] border-neutral-900 text-[10.8px]">
          <div className="border-b-[1.33px] border-neutral-900 px-1.5 py-1 text-[10px] leading-none">
            <span>
              Total Items / Qty : {items.length} / {totalQuantity}
            </span>
          </div>

          <div className="border-b-[1.33px] border-neutral-900">
            <SummaryRow label="Taxable Amount" value={formatINR(invoice.taxable_amount)} />
            {taxGroups.map((group) =>
              group.interstate ? (
                <SummaryRow
                  key={group.rate}
                  label={`IGST ${group.rate}%`}
                  value={formatINR(group.igst)}
                />
              ) : (
                <SummaryRow
                  key={`${group.rate}-c`}
                  label={`CGST ${group.rate}%`}
                  value={formatINR(group.cgstAmount)}
                />
              ),
            )}
            {!interstate &&
              taxGroups.map((group) => (
                <SummaryRow
                  key={`${group.rate}-s`}
                  label={`SGST ${group.rate}%`}
                  value={formatINR(group.sgstAmount)}
                />
              ))}
            {cess > 0 && <SummaryRow label="Cess" value={formatINR(cess)} />}
            {totalDiscount > 0 && <SummaryRow label="Discount" value={`- ${formatINR(totalDiscount)}`} />}
            {roundOff !== 0 && <SummaryRow label="Round Off" value={formatINR(roundOff)} />}
          </div>

          <div className="flex items-center justify-between border-b-[1.92px] border-neutral-900 px-1.5 py-[2px] leading-5">
            <span className="text-[16px] font-bold">Total</span>
            <span className="text-[16.8px] font-bold">{formatINR(invoice.grand_total)}</span>
          </div>

          <div className="border-b-[1.33px] border-neutral-900 px-1.5 py-px text-[10.7px] leading-3">
            <span>Total amount (in words): {amountInWords(invoice.grand_total)}</span>
          </div>

          {showBalance && (
            <div className="grid grid-cols-[1fr_22%] px-1.5 py-[2px] text-[12px] font-bold leading-[14px] text-neutral-600">
              <span className="text-right">Amount Payable:</span>
              <span className="text-right">
                {formatINR(invoice.balance_due ?? invoice.grand_total)}
              </span>
            </div>
          )}
        </section>

        {/* -------------------------------------------- bank + signature -- */}
        <section className="grid grid-cols-[67%_33%] border-t-[1.92px] border-neutral-900 text-[10.8px]">
          <div className="px-1.5 py-2">
            <div className="font-bold">Bank Details:</div>
            {settings.show_bank_details && (settings.bank_name || settings.account_number) && (
              <dl className="mt-1 grid grid-cols-[122px_1fr] text-[11.7px] leading-[16.4px]">
                {settings.bank_name && (
                  <>
                    <dt className="text-neutral-700">Bank:</dt>
                    <dd className="font-semibold">{settings.bank_name}</dd>
                  </>
                )}
                {settings.account_holder && (
                  <>
                    <dt className="text-neutral-700">Account Holder:</dt>
                    <dd className="font-semibold">{settings.account_holder}</dd>
                  </>
                )}
                {settings.account_number && (
                  <>
                    <dt className="text-neutral-700">Account #:</dt>
                    <dd className="font-semibold">{settings.account_number}</dd>
                  </>
                )}
                {settings.ifsc_code && (
                  <>
                    <dt className="text-neutral-700">IFSC Code:</dt>
                    <dd className="font-semibold">{settings.ifsc_code}</dd>
                  </>
                )}
                {settings.branch && (
                  <>
                    <dt className="text-neutral-700">Branch:</dt>
                    <dd className="font-semibold">{settings.branch}</dd>
                  </>
                )}
              </dl>
            )}
          </div>

          <div className="flex flex-col border-l-[1.92px] border-neutral-900 px-1.5 py-2 text-right text-[8.8px] leading-3">
            <div>For {business.business_name}</div>
            <div className="flex grow items-center justify-end py-1">
              {settings.signature_image && (
                <img
                  src={settings.signature_image}
                  alt="Signature"
                  className="max-h-[46px] w-auto max-w-[150px] object-contain"
                />
              )}
            </div>
            {signatory && <div>{signatory}</div>}
            <div className="text-neutral-700">Authorized Signatory</div>
          </div>
        </section>

        {/* -------------------------------------------- notes and terms --- */}
        {invoice.notes && (
          <section className="border-t-[1.33px] border-neutral-900 px-1.5 py-2 text-[10.8px] leading-[13.5px]">
            <span className="font-semibold">Notes: </span>
            {invoice.notes}
          </section>
        )}

        {(invoice.terms || settings.default_terms) && (
          <section className="border-t-[1.33px] border-neutral-900 px-1.5 py-2 text-[10.8px] leading-[13.5px]">
            <div className="font-semibold">Terms &amp; Conditions:</div>
            <ol className="list-decimal space-y-0.5 pl-4">
              {(invoice.terms || settings.default_terms || "")
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
            </ol>
          </section>
        )}

        {/* ---------------------------------------------------- footer ---- */}
        <footer className="mt-auto flex border-t-[1.92px] border-neutral-900 text-[10.8px] leading-[13px]">
          <div className="w-[45.3%] border-r-[1.92px] border-neutral-900" />
          <div className="flex-1 px-1.5 text-right text-neutral-700">Powered by BillFlow</div>
        </footer>
      </div>

      {/* ------------------------------------------------- below frame --- */}
      {footerText && (
        <div className="mt-1 text-[12px] font-semibold leading-[14px]">
          <span className="underline decoration-[0.75px] underline-offset-[2px]" style={{ color: accent }}>
            {footerText}
          </span>
        </div>
      )}
      <div className={cn("text-[10.8px] font-medium leading-[13px] text-neutral-900", !footerText && "mt-1")}>
        This is a computer generated document and requires no signature.
      </div>
    </article>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_22%] px-1.5 leading-4">
      <span className="text-right font-bold">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  );
}
