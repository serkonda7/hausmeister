import { expect, test } from "bun:test";
import { berlinTime, nextDailyInBerlin } from "./schedule";

test("Berlin wall-clock times in winter and summer, across the DST switches", () => {
  expect(berlinTime("2026-11-18", 8).toISOString()).toBe("2026-11-18T07:00:00.000Z");
  expect(berlinTime("2026-07-01", 8).toISOString()).toBe("2026-07-01T06:00:00.000Z");
  // 2026-03-29: clocks go 02:00 → 03:00; 2026-10-25: 03:00 → 02:00.
  expect(berlinTime("2026-03-29", 8).toISOString()).toBe("2026-03-29T06:00:00.000Z");
  expect(berlinTime("2026-10-25", 8).toISOString()).toBe("2026-10-25T07:00:00.000Z");
});

test("the next 08:00: later today, or tomorrow once it has passed", () => {
  const at = (iso: string) => nextDailyInBerlin(new Date(iso), 8).toISOString();
  expect(at("2026-11-18T06:59:00Z")).toBe("2026-11-18T07:00:00.000Z");
  expect(at("2026-11-18T07:00:00Z")).toBe("2026-11-19T07:00:00.000Z");
  // 23:30 UTC is already the next day in Berlin.
  expect(at("2026-11-18T23:30:00Z")).toBe("2026-11-19T07:00:00.000Z");
  // Saturday before the spring switch: Sunday 08:00 is CEST.
  expect(at("2026-03-28T09:00:00Z")).toBe("2026-03-29T06:00:00.000Z");
});
