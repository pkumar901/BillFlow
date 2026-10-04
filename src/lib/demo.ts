import { api } from "./api";

/**
 * Sample data helpers (demo mode).
 *
 * Everything here goes through the real Worker API and is stored in the real
 * D1 database - no mock data lives in the frontend.
 */

export const DEMO_CUSTOMER_NAME = "Demo Manufacturing Pvt Ltd";
export const DEMO_CUSTOMER_2 = "Demo Retail Traders";
export const DEMO_PRODUCT = "Precision Tool";
export const DEMO_PRODUCT_2 = "Tooling Service";

async function getOrCreateCustomer(name: string, state: string): Promise<string> {
  const existing = await api.getCustomers({ q: name, limit: 50 });
  const found = existing.items.find((customer) => customer.name === name);
  if (found) return found.id;

  const created = await api.createCustomer({
    name,
    company_name: name,
    gstin: "33ABCDE1234F1Z5",
    billing_address: "12, Industrial Estate",
    city: "Coimbatore",
    state,
    pincode: "641021",
    email: "accounts@demo.example.com",
    phone: "9876543210",
    place_of_supply: state,
  });
  return created.id;
}

async function getOrCreateProduct(name: string, price: number, gstRate: number, unit: string): Promise<string> {
  const existing = await api.getProducts({ q: name, limit: 50 });
  const found = existing.items.find((product) => product.name === name);
  if (found) return found.id;

  const created = await api.createProduct({
    name,
    hsn_sac: "8466",
    description: `${name} (demo item)`,
    unit,
    selling_price: price,
    gst_rate: gstRate,
    cess: 0,
    stock_quantity: 100,
  });
  return created.id;
}

/** Creates a couple of demo invoices through the real API. */
export async function seedDemoData(businessState: string): Promise<{ created: number }> {
  const state = businessState || "Tamil Nadu";
  const customer1 = await getOrCreateCustomer(DEMO_CUSTOMER_NAME, state);
  const customer2 = await getOrCreateCustomer(DEMO_CUSTOMER_2, state);
  const product1 = await getOrCreateProduct(DEMO_PRODUCT, 169.49, 18, "PCS");
  const product2 = await getOrCreateProduct(DEMO_PRODUCT_2, 2500, 18, "HRS");

  const today = new Date();
  const iso = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };

  await api.createInvoice({
    customer_id: customer1,
    invoice_date: iso(2),
    due_date: iso(-8),
    place_of_supply: state,
    reference_number: "PO-DEMO-001",
    po_date: iso(3),
    payment_terms: "10 Days",
    notes: "Demo invoice created by BillFlow sample data.",
    items: [
      {
        product_id: product1,
        item_name: DEMO_PRODUCT,
        description: "High precision tooling component",
        hsn_sac: "8466",
        rate: 169.49,
        quantity: 8,
        unit: "PCS",
        gst_rate: 18,
      },
    ],
  });

  await api.createInvoice({
    customer_id: customer2,
    invoice_date: iso(9),
    due_date: iso(-1),
    place_of_supply: state,
    payment_terms: "15 Days",
    notes: "Demo invoice created by BillFlow sample data.",
    items: [
      {
        product_id: product2,
        item_name: DEMO_PRODUCT_2,
        description: "On-site tooling support",
        hsn_sac: "9987",
        rate: 2500,
        quantity: 3,
        unit: "HRS",
        gst_rate: 18,
      },
      {
        product_id: product1,
        item_name: DEMO_PRODUCT,
        description: "Consumable tools",
        hsn_sac: "8466",
        rate: 169.49,
        quantity: 12,
        unit: "PCS",
        gst_rate: 18,
      },
    ],
  });

  return { created: 2 };
}

/** Removes invoices, customers and products whose name starts with "Demo". */
export async function deleteDemoData(): Promise<{ removed: number }> {
  let removed = 0;

  const customers = await api.getCustomers({ q: "Demo", limit: 200 });
  const demoCustomerIds = new Set(
    customers.items.filter((c) => c.name.startsWith("Demo")).map((c) => c.id),
  );

  if (demoCustomerIds.size > 0) {
    let page = 1;
    // delete demo invoices first (they block customer deletion)
    for (;;) {
      const invoices = await api.getInvoices({ page, limit: 100 });
      const demoInvoices = invoices.items.filter(
        (invoice) => invoice.customer_id && demoCustomerIds.has(invoice.customer_id),
      );
      for (const invoice of demoInvoices) {
        try {
          await api.deleteInvoice(invoice.id);
          removed += 1;
        } catch {
          /* invoice may have payments - keep it and report through the caller */
        }
      }
      if (page * 100 >= invoices.total) break;
      page += 1;
      if (page > 20) break;
    }
  }

  for (const customer of customers.items) {
    if (!customer.name.startsWith("Demo")) continue;
    try {
      await api.deleteCustomer(customer.id);
      removed += 1;
    } catch {
      /* ignore - caller surfaces the result */
    }
  }

  const products = await api.getProducts({ q: "Demo", limit: 200 });
  for (const product of products.items) {
    if (!product.name.startsWith("Demo") && !product.description?.startsWith("Demo")) {
      // demo products are created with "(demo item)" descriptions
      if (!product.description?.includes("demo item")) continue;
    }
    try {
      await api.deleteProduct(product.id);
      removed += 1;
    } catch {
      /* ignore */
    }
  }

  return { removed };
}
