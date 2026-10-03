/** Indian states / union territories with their GST state codes. */

export interface StateOption {
  code: string;
  name: string;
}

export const STATES: StateOption[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));
const BY_NAME = new Map(STATES.map((s) => [s.name.toUpperCase(), s]));

/** `33 - Tamil Nadu` (used across the app for state / place of supply fields). */
export function stateLabel(state: StateOption): string {
  return `${state.code} - ${state.name}`;
}

/** Accepts "33", "33 - Tamil Nadu", "Tamil Nadu", "tamil nadu (33)" ... */
export function normalizeState(input?: string | null): string {
  if (!input) return "";
  let s = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (!s) return "";

  const codeMatch = s.match(/^(\d{1,2})\s*(?:[-–—:]\s*)?(.*)$/);
  if (codeMatch && BY_CODE.has(codeMatch[1].padStart(2, "0"))) {
    const state = BY_CODE.get(codeMatch[1].padStart(2, "0"))!;
    if (!codeMatch[2] || codeMatch[2] === state.name.toUpperCase()) return state.name.toUpperCase();
  }

  s = s.replace(/\s*\(\d{1,2}\)\s*$/, "").trim();
  const direct = BY_NAME.get(s);
  if (direct) return direct.name.toUpperCase();

  for (const state of STATES) {
    if (state.name.toUpperCase() === s) return state.name.toUpperCase();
  }
  return s;
}

/**
 * Two-digit GST state code for a place of supply ("33 - Tamil Nadu"), a GSTIN
 * ("33ABC..."), a bare code ("33") or a plain state name ("Tamil Nadu").
 * Returns "" when nothing can be resolved.
 */
export function stateCodeFor(input?: string | null): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";

  const codePrefix = raw.match(/^(\d{1,2})(?![0-9A-Za-z])/);
  if (codePrefix) {
    const code = codePrefix[1].padStart(2, "0");
    if (BY_CODE.has(code)) return code;
  }

  const gstin = raw.match(/^(\d{2})[A-Za-z]{5}/);
  if (gstin && BY_CODE.has(gstin[1])) return gstin[1];

  const byName = BY_NAME.get(normalizeState(raw));
  if (byName) return byName.code;

  return "";
}

/** True when both inputs resolve to the same Indian state. */
export function sameState(a?: string | null, b?: string | null): boolean {
  const na = normalizeState(a);
  const nb = normalizeState(b);
  if (!na || !nb) return false;
  return na === nb;
}
