import { describe, expect, it } from "bun:test";
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatIsoDay,
  formatNumber,
  isoDayInBerlin,
  parseDecimalDe,
  parseEuroToCents,
} from "./format";

describe("formatDate", () => {
  it("formats Date, ISO string and timestamp values as dd.MM.yyyy", () => {
    expect(formatDate(new Date("2026-03-05T13:07:00Z"))).toBe("05.03.2026");
    expect(formatDate("2026-03-05T14:07:00+01:00")).toBe("05.03.2026");
    expect(formatDate(Date.UTC(2026, 2, 5, 12))).toBe("05.03.2026");
  });

  it("uses Europe/Berlin, not UTC", () => {
    // 23:30 UTC on New Year's Eve is already the next day in Berlin.
    expect(formatDate("2025-12-31T23:30:00Z")).toBe("01.01.2026");
  });
});

describe("formatDateTime", () => {
  it("formats date and 24-hour time", () => {
    expect(formatDateTime(new Date("2026-03-05T13:07:00Z"))).toBe("05.03.2026, 14:07");
    expect(formatDateTime("2026-03-05T12:00:00Z")).toBe("05.03.2026, 13:00");
    expect(formatDateTime(Date.UTC(2026, 2, 5, 13, 7))).toBe("05.03.2026, 14:07");
  });
});

describe("formatNumber", () => {
  it("uses German grouping and decimal separators", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatNumber(1234567.891)).toBe("1.234.567,89");
    expect(formatNumber(0)).toBe("0");
  });

  it("respects maximumFractionDigits", () => {
    expect(formatNumber(1.23456, 3)).toBe("1,235");
    expect(formatNumber(1.5, 0)).toBe("2");
  });
});

describe("formatCents", () => {
  it("formats cents as a currency amount with a non-breaking space", () => {
    const formatted = formatCents(123456);
    expect(formatted).toContain("\u00a0€");
    expect(formatted.replace(/\u00a0/g, " ")).toBe("1.234,56 €");
    expect(formatCents(0).replace(/\u00a0/g, " ")).toBe("0,00 €");
  });

  it("honors a custom currency", () => {
    expect(formatCents(500, "USD").replace(/\u00a0/g, " ")).toBe("5,00 $");
  });
});

describe("parseDecimalDe", () => {
  it("parses German decimal and thousands separators", () => {
    expect(parseDecimalDe("1.234,56")).toBe(1234.56);
    expect(parseDecimalDe("12")).toBe(12);
    expect(parseDecimalDe("12,5")).toBe(12.5);
    expect(parseDecimalDe(" 1 234,5 ")).toBe(1234.5);
    expect(parseDecimalDe("-1.234,56")).toBe(-1234.56);
  });

  it("accepts a single dot as decimal point when there is no comma", () => {
    expect(parseDecimalDe("12.5")).toBe(12.5);
  });

  it("rejects invalid or empty input", () => {
    expect(parseDecimalDe("abc")).toBeNull();
    expect(parseDecimalDe("")).toBeNull();
    expect(parseDecimalDe("   ")).toBeNull();
    expect(parseDecimalDe("12abc")).toBeNull();
    expect(parseDecimalDe("1.2.3")).toBeNull();
    expect(parseDecimalDe("1,2,3")).toBeNull();
  });
});

describe("parseEuroToCents", () => {
  it("parses Euro strings into cents", () => {
    expect(parseEuroToCents("12,50")).toBe(1250);
    expect(parseEuroToCents("12,5 €")).toBe(1250);
    expect(parseEuroToCents("1.234,56")).toBe(123456);
    expect(parseEuroToCents("0,01")).toBe(1);
  });

  it("rounds half up to the nearest cent without floating-point artifacts", () => {
    expect(parseEuroToCents("1.005")).toBe(101);
    expect(parseEuroToCents("1,005 €")).toBe(101);
    expect(parseEuroToCents("0,004")).toBe(0);
    expect(parseEuroToCents("-1,005 €")).toBe(-101);
  });

  it("rejects invalid or empty input", () => {
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("")).toBeNull();
    expect(parseEuroToCents(" € ")).toBeNull();
  });
});

describe("isoDayInBerlin", () => {
  it("is the Berlin calendar day", () => {
    expect(isoDayInBerlin(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(isoDayInBerlin(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(formatIsoDay("2026-11-21")).toBe("21.11.2026");
  });
});
