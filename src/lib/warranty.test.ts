import { expect, test } from "bun:test";
import { addDays, daysBetween, warrantyState } from "./warranty";

test("calendar arithmetic over month and year ends", () => {
  expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  expect(daysBetween("2026-11-18", "2026-12-18")).toBe(30);
  expect(daysBetween("2026-11-18", "2026-11-17")).toBe(-1);
});

test("warranty state: active, ending within 30 days (end day included), expired", () => {
  const today = "2026-11-18";
  expect(warrantyState("2026-12-19", today)).toEqual({ state: "active", daysLeft: 31 });
  expect(warrantyState("2026-12-18", today)).toEqual({ state: "ending", daysLeft: 30 });
  expect(warrantyState("2026-11-18", today)).toEqual({ state: "ending", daysLeft: 0 });
  expect(warrantyState("2026-11-16", today)).toEqual({ state: "expired", daysAgo: 2 });
  expect(warrantyState("nope", today)).toBeNull();
  expect(warrantyState(undefined, today)).toBeNull();
});
