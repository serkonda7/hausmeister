import { describe, expect, it } from "bun:test";
import {
  generateShortCode,
  isShortCode,
  normalizeShortCode,
  SHORT_CODE_ALPHABET,
} from "./short-code";

describe("SHORT_CODE_ALPHABET", () => {
  it("contains only unambiguous uppercase letters and digits", () => {
    expect(SHORT_CODE_ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
    for (const forbidden of ["0", "1", "I", "L", "O"]) {
      expect(SHORT_CODE_ALPHABET).not.toContain(forbidden);
    }
  });
});

describe("generateShortCode", () => {
  it("defaults to six characters from the alphabet", () => {
    const code = generateShortCode();
    expect(code).toHaveLength(6);
    for (const char of code) {
      expect(SHORT_CODE_ALPHABET).toContain(char);
    }
  });

  it("honors a custom length, including zero", () => {
    expect(generateShortCode(10)).toHaveLength(10);
    expect(generateShortCode(0)).toBe("");
  });

  it("uses the injected randomInt with the alphabet size", () => {
    const requested: number[] = [];
    expect(
      generateShortCode(3, (maxExclusive) => {
        requested.push(maxExclusive);
        return 0;
      }),
    ).toBe("AAA");
    expect(requested).toEqual([31, 31, 31]);
    expect(generateShortCode(3, () => SHORT_CODE_ALPHABET.length - 1)).toBe("999");
  });
});

describe("normalizeShortCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeShortCode(" k7m2qx ")).toBe("K7M2QX");
    expect(normalizeShortCode("K7M2QX")).toBe("K7M2QX");
    expect(normalizeShortCode("")).toBe("");
  });
});

describe("isShortCode", () => {
  it("accepts normalized codes of 4 to 12 alphabet characters", () => {
    expect(isShortCode("K7M2QX")).toBe(true);
    expect(isShortCode(" k7m2qx ")).toBe(true);
    expect(isShortCode("K7M2")).toBe(true);
    expect(isShortCode("K7M2QXK7M2QX")).toBe(true);
  });

  it("rejects wrong lengths, confusables and other characters", () => {
    expect(isShortCode("AB")).toBe(false);
    expect(isShortCode("")).toBe(false);
    expect(isShortCode("K7M2QXK7M2QXA")).toBe(false);
    expect(isShortCode("K7M2O1")).toBe(false);
    expect(isShortCode("K7M2I1")).toBe(false);
    expect(isShortCode("ABCD-EF")).toBe(false);
  });
});
