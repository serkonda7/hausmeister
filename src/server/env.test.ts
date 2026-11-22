import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  test("dev defaults", () => {
    const e = parseEnv({});
    expect(e.ORIGIN).toBe("http://localhost:3000");
    expect(e.DATABASE_PATH).toBe("./data/db/app.sqlite");
    expect(e.UPLOAD_DIR).toBe("./data/uploads");
    expect(e.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(e.isProduction).toBe(false);
    expect(e.ISBN_LOOKUP).toBe("on");
    expect(parseEnv({ ISBN_LOOKUP: "off" }).ISBN_LOOKUP).toBe("off");
  });

  test("production requires a real secret", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => parseEnv({ NODE_ENV: "production", BETTER_AUTH_SECRET: "short" })).toThrow(
      /32 characters/,
    );
    const e = parseEnv({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "x".repeat(40),
      ORIGIN: "https://sub.example.de/",
      SMTP_URL: "",
    });
    expect(e.ORIGIN).toBe("https://sub.example.de");
    expect(e.SMTP_URL).toBeUndefined();
  });

  test("rejects an invalid ORIGIN", () => {
    expect(() => parseEnv({ ORIGIN: "not a url" })).toThrow(/ORIGIN/);
  });
});
