import type {
  AuditLog,
  AuthSession,
  Business,
  CreateInvoicePayload,
  Customer,
  CustomerReportRow,
  DashboardData,
  GstReport,
  Invoice,
  InvoiceDetail,
  InvoiceSettings,
  OutstandingRow,
  Page,
  Payment,
  PaymentMethod,
  PaymentReport,
  Product,
  ProductReportRow,
  PublicUser,
  SalesReport,
} from "~shared/types";

/* ------------------------------- transport ------------------------------- */

const TOKEN_KEY = "billflow_token";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable - session simply won't persist */
  }
}

type QueryValue = string | number | boolean | null | undefined;

function qs(params?: Record<string, QueryValue>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, QueryValue> } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const url = `/api${path}${qs(options.query)}`;
  const token = getToken();

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Unable to reach the server. Check your connection and try again.");
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope = payload as { success?: boolean; error?: string } | null;
    const message = envelope?.error ?? `Request failed (${response.status}). Please try again.`;
    if (response.status === 401) {
      setToken(null);
      window.dispatchEvent(new CustomEvent("billflow:unauthorized"));
    }
    throw new ApiError(response.status, message);
  }

  const envelope = payload as { success?: boolean; data?: T } | null;
  if (!envelope || envelope.success !== true) {
    throw new ApiError(response.status, "The server returned an unexpected response.");
  }
  return envelope.data as T;
}

/* --------------------------------- api ----------------------------------- */

export interface InvoiceQuery {
  [key: string]: QueryValue;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  customer_id?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}

export interface ReportQuery {
  [key: string]: QueryValue;
  from?: string;
  to?: string;
  groupBy?: string;
}

export const api = {
  /* ---- auth ---- */
  auth: {
    signup: (body: { name: string; email: string; password: string; business_name?: string }) =>
      request<AuthSession & { verification_url?: string }>("/auth/signup", { method: "POST", body }),
    login: (body: { email: string; password: string }) =>
      request<AuthSession & { verification_url?: string }>("/auth/login", { method: "POST", body }),
    me: () => request<AuthSession>("/auth/me"),
    verify: (token: string) => request<{ verified: boolean }>("/auth/verify", { method: "POST", body: { token } }),
    forgot: (email: string) =>
      request<{ message: string; reset_url?: string }>("/auth/forgot", { method: "POST", body: { email } }),
    reset: (token: string, password: string) =>
      request<{ reset: boolean }>("/auth/reset", { method: "POST", body: { token, password } }),
    updateProfile: (body: { name: string; email: string }) =>
      request<AuthSession>("/auth/profile", { method: "PUT", body }),
    changePassword: (body: { current_password: string; new_password: string }) =>
      request<{ changed: boolean }>("/auth/change-password", { method: "POST", body }),
  },

  /* ---- business + settings ---- */
  getBusiness: () => request<{ business: Business; settings: InvoiceSettings }>("/business"),
  updateBusiness: (body: Partial<Business>) =>
    request<{ business: Business; settings: InvoiceSettings }>("/business", { method: "PUT", body }),
  getInvoiceSettings: () => request<InvoiceSettings>("/invoice-settings"),
  updateInvoiceSettings: (body: Partial<InvoiceSettings>) =>
    request<InvoiceSettings>("/invoice-settings", { method: "PUT", body }),

  /* ---- customers ---- */
  getCustomers: (query?: { q?: string; state?: string; page?: number; limit?: number; sort?: string; order?: string }) =>
    request<Page<Customer>>("/customers", { query }),
  getCustomer: (id: string) => request<Customer>(`/customers/${id}`),
  createCustomer: (body: Partial<Customer>) => request<Customer>("/customers", { method: "POST", body }),
  updateCustomer: (id: string, body: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, { method: "PUT", body }),
  deleteCustomer: (id: string) => request<{ deleted: boolean }>(`/customers/${id}`, { method: "DELETE" }),

  /* ---- products ---- */
  getProducts: (query?: { q?: string; page?: number; limit?: number }) =>
    request<Page<Product>>("/products", { query }),
  createProduct: (body: Partial<Product>) => request<Product>("/products", { method: "POST", body }),
  updateProduct: (id: string, body: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: "PUT", body }),
  deleteProduct: (id: string) => request<{ deleted: boolean }>(`/products/${id}`, { method: "DELETE" }),

  /* ---- invoices ---- */
  getNextInvoiceNumber: () => request<{ invoice_number: string }>("/invoices/next-number"),
  getInvoices: (query?: InvoiceQuery) => request<Page<Invoice>>("/invoices", { query }),
  getInvoice: (id: string) => request<InvoiceDetail>(`/invoices/${id}`),
  createInvoice: (body: CreateInvoicePayload) =>
    request<InvoiceDetail>("/invoices", { method: "POST", body }),
  updateInvoice: (id: string, body: CreateInvoicePayload) =>
    request<InvoiceDetail>(`/invoices/${id}`, { method: "PUT", body }),
  cancelInvoice: (id: string, reason?: string) =>
    request<InvoiceDetail>(`/invoices/${id}`, {
      method: "PUT",
      body: { payment_status: "cancelled", reason },
    }),
  restoreInvoice: (id: string) =>
    request<InvoiceDetail>(`/invoices/${id}`, { method: "PUT", body: { restore: true } }),
  deleteInvoice: (id: string) => request<{ deleted: boolean }>(`/invoices/${id}`, { method: "DELETE" }),

  /* ---- payments ---- */
  recordPayment: (
    invoiceId: string,
    body: {
      amount: number;
      payment_date: string;
      payment_method: PaymentMethod | string;
      transaction_reference?: string | null;
      notes?: string | null;
    },
  ) => request<{ payment: Payment; invoice: Invoice }>(`/invoices/${invoiceId}/payment`, { method: "POST", body }),
  getPayments: (query?: {
    from?: string;
    to?: string;
    method?: string;
    invoice_id?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => request<Page<Payment> & { total_amount: number }>("/payments", { query }),
  deletePayment: (id: string) => request<{ deleted: boolean }>(`/payments/${id}`, { method: "DELETE" }),

  /* ---- dashboard + reports ---- */
  getDashboard: () => request<DashboardData>("/dashboard"),
  getAudit: (limit = 50) => request<{ items: AuditLog[] }>("/audit", { query: { limit } }),
  getSalesReport: (query?: ReportQuery) => request<SalesReport>("/reports/sales", { query }),
  getGstReport: (query?: ReportQuery) => request<GstReport>("/reports/gst", { query }),
  getOutstandingReport: () =>
    request<{ items: OutstandingRow[]; total_outstanding: number }>("/reports/outstanding"),
  getPaymentReport: (query?: ReportQuery) => request<PaymentReport>("/reports/payments", { query }),
  getCustomerReport: (query?: ReportQuery) =>
    request<{ items: CustomerReportRow[] }>("/reports/customers", { query }),
  getProductReport: (query?: ReportQuery) =>
    request<{ items: ProductReportRow[] }>("/reports/products", { query }),
};

export type Api = typeof api;
export type { PublicUser };
