import { describe, expect, test } from "bun:test";
import { isCrossSiteWrite } from "./csrf";

const O = "https://sub.example.de";
const req = (method: string, headers: Record<string, string> = {}) =>
  new Request(`${O}/x`, { method, headers });

describe("isCrossSiteWrite", () => {
  test("allows reads and same-origin writes", () => {
    expect(isCrossSiteWrite(req("GET", { origin: "https://evil.example" }), O)).toBe(false);
    expect(isCrossSiteWrite(req("POST", { origin: O }), O)).toBe(false);
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-origin" }), O)).toBe(false);
    expect(isCrossSiteWrite(req("POST"), O)).toBe(false);
  });
  test("rejects cross-origin writes", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "https://evil.example" }), O)).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", { origin: "https://other.sub.example.de" }), O)).toBe(
      true,
    );
    expect(isCrossSiteWrite(req("POST", { origin: "null" }), O)).toBe(true);
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "cross-site" }), O)).toBe(true);
  });
});
