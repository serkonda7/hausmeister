import { describe, expect, it } from "bun:test";
import { normalizeSearchText } from "./normalize";

describe("normalizeSearchText", () => {
  it("lowercases, collapses whitespace and trims", () => {
    expect(normalizeSearchText("  SÄGE  Größe ")).toBe("sage grosse");
    expect(normalizeSearchText("  multiple\tlines\nhere  ")).toBe("multiple lines here");
  });

  it("removes diacritics without expanding umlauts to digraphs", () => {
    expect(normalizeSearchText("ÄÖÜ äöü")).toBe("aou aou");
    expect(normalizeSearchText("Éléphant")).toBe("elephant");
  });

  it("replaces ß with ss", () => {
    expect(normalizeSearchText("Straße")).toBe("strasse");
    expect(normalizeSearchText("Größe")).toBe("grosse");
  });

  it("handles empty input", () => {
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText("   ")).toBe("");
  });
});
