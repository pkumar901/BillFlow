/** API errors with HTTP status codes - always serialised as JSON. */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const badRequest = (message: string) => new ApiError(400, message);
export const unauthorized = (message = "Please sign in to continue.") => new ApiError(401, message);
export const forbidden = (message = "You do not have access to this resource.") => new ApiError(403, message);
export const notFound = (message = "The requested resource was not found.") => new ApiError(404, message);
export const conflict = (message: string) => new ApiError(409, message);
export const unprocessable = (message: string) => new ApiError(422, message);

/** Flattens a zod error into one readable line. */
export function validationError(issues: Array<{ path: PropertyKey[]; message: string }>): ApiError {
  const first = issues[0];
  if (!first) return new ApiError(422, "Please check the submitted values.");
  const parts = first.path.map((part) => String(part));

  // "items.0.rate" reads better as "Item 1 rate" for invoice line errors.
  let label = parts.join(".");
  if (parts[0] === "items" && parts.length > 1 && /^\d+$/.test(parts[1])) {
    const rest = parts.slice(2).join(" ");
    label = `Item ${Number(parts[1]) + 1}${rest ? ` ${rest}` : ""}`;
  }

  return new ApiError(422, label ? `${label}: ${first.message}` : first.message);
}
