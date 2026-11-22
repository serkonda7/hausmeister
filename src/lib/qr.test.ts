import { describe, expect, test } from "bun:test";
import { labelUrl, qrMatrix, qrPath, shortCodeFromScan } from "./qr";
import { isShortCode } from "./short-code";

describe("qr", () => {
  test("a label URL fits version 3 (29 modules) with the finder patterns in place", () => {
    const mx = qrMatrix(labelUrl("https://sub.example.de/", "K7M2QX"));
    expect(mx.size).toBe(29);
    // Finder pattern corners: dark ring, light gap, dark core.
    for (const [r, c] of [
      [0, 0],
      [0, 28],
      [28, 0],
    ] as const) {
      expect(mx.dark(r, c)).toBe(true);
      expect(mx.dark(r + (r ? -1 : 1), c + (c ? -1 : 1))).toBe(false);
      expect(mx.dark(r + (r ? -3 : 3), c + (c ? -3 : 3))).toBe(true);
    }
  });

  test("the path merges runs and honours the margin", () => {
    const m = { size: 3, dark: (r: number, c: number) => r === 1 && c < 2 };
    expect(qrPath(m, 2)).toBe("M2 3h2v1h-2z");
    expect(qrPath({ size: 2, dark: () => false })).toBe("");
  });

  test("short codes from scans: label URLs and bare codes, nothing else", () => {
    expect(labelUrl("https://sub.example.de", "K7M2QX")).toBe("https://sub.example.de/q/K7M2QX");
    expect(shortCodeFromScan("https://sub.example.de/q/K7M2QX", isShortCode)).toBe("K7M2QX");
    expect(shortCodeFromScan("http://localhost:3000/q/k7m2qx/", isShortCode)).toBe("K7M2QX");
    expect(shortCodeFromScan(" k7m2qx ", isShortCode)).toBe("K7M2QX");
    expect(shortCodeFromScan("9783161484100", isShortCode)).toBeNull();
    expect(shortCodeFromScan("https://example.com/other/K7M2QX", isShortCode)).toBeNull();
  });
});
