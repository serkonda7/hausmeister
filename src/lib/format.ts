const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: Date | string | number): string {
  return DATE_FORMAT.format(toDate(value));
}

export function formatDateTime(value: Date | string | number): string {
  return DATE_TIME_FORMAT.format(toDate(value));
}

const ISO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day in Europe/Berlin as 'YYYY-MM-DD' (due dates, "today"). */
export function isoDayInBerlin(value: Date | string | number = new Date()): string {
  return ISO_DAY.format(toDate(value));
}

/** 'YYYY-MM-DD' -> "21.11.2026" (noon UTC keeps the day in every zone). */
export function formatIsoDay(day: string): string {
  return formatDate(`${day}T12:00:00Z`);
}

export function formatNumber(n: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits }).format(n);
}

export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Validates the input and returns a plain numeric string (with "." as the
 * decimal separator) that the number and cents parsers can both consume.
 */
function normalizeDecimalString(input: string): string | null {
  const cleaned = input.replace(/\s/g, "");
  if (cleaned === "") return null;

  let normalized: string;
  if (cleaned.includes(",")) {
    // Comma is the decimal separator; dots are thousands separators.
    if ((cleaned.match(/,/g) ?? []).length !== 1) return null;
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Without a comma, a single dot is the decimal separator.
    normalized = cleaned;
  }

  return DECIMAL_PATTERN.test(normalized) ? normalized : null;
}

export function parseDecimalDe(input: string): number | null {
  const normalized = normalizeDecimalString(input);
  if (normalized === null) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseEuroToCents(input: string): number | null {
  const normalized = normalizeDecimalString(input.replace(/€/g, ""));
  if (normalized === null) return null;

  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[+-]/, "");
  const [integerPart = "", fractionPart = ""] = unsigned.split(".");
  // Pad so the third fractional digit is always present for half-up rounding,
  // avoiding floating-point artifacts such as 1.005 * 100 === 100.49999...
  const digits = fractionPart.padEnd(3, "0");
  const wholeCents = (integerPart === "" ? 0 : Number(integerPart)) * 100;
  const cents = Number(digits.slice(0, 2));
  const roundUp = Number(digits[2]) >= 5 ? 1 : 0;
  const result = wholeCents + cents + roundUp;
  return Number.isFinite(result) ? (negative ? -result : result) : null;
}
