import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { HttpError } from "../auth/context";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { events, settings } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { getSettings, updateSettings } from "./service";

const DEFAULTS = {
  householdName: "Unser Haushalt",
  currency: "EUR",
  locale: "de-DE",
};

const ctxOf = (role: AuthCtx["role"]): AuthCtx => ({
  userId: `actor-${role}`,
  role,
  groupIds: new Set(),
});

const inputOf = (householdName: string, currency = "EUR") => ({ householdName, currency });

function expectError(fn: () => unknown, status: HttpError["status"], message: string) {
  try {
    fn();
    throw new Error("expected an HttpError");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    expect((err as HttpError).message).toBe(message);
  }
}

function settingsEvents(db: AppDb) {
  return db.select().from(events).all();
}

describe("settings", () => {
  test("getSettings returns the defaults on a fresh database", () => {
    const db = createTestDb();
    expect(getSettings(db)).toEqual(DEFAULTS);
  });

  test("an admin can update the settings; values are stored and trimmed", () => {
    const db = createTestDb();
    const result = updateSettings(db, ctxOf("admin"), inputOf("  Mein Zuhause  ", "CHF"));
    expect(result).toEqual({ householdName: "Mein Zuhause", currency: "CHF", locale: "de-DE" });
    expect(getSettings(db)).toEqual(result);
    const row = db.select().from(settings).where(eq(settings.id, 1)).get();
    expect(row?.householdName).toBe("Mein Zuhause");
    expect(row?.currency).toBe("CHF");
    expect(row?.locale).toBe("de-DE");

    // A name of exactly 80 characters is still valid.
    const name = "x".repeat(80);
    expect(updateSettings(db, ctxOf("admin"), inputOf(name)).householdName).toBe(name);
  });

  test("members and guests get 403 and nothing changes", () => {
    const db = createTestDb();
    for (const role of ["member", "guest"] as const) {
      expectError(() => updateSettings(db, ctxOf(role), inputOf("Hack", "USD")), 403, "Forbidden");
    }
    expect(getSettings(db)).toEqual(DEFAULTS);
    expect(settingsEvents(db)).toHaveLength(0);
  });

  test("invalid input is refused with the matching error code", () => {
    const db = createTestDb();
    expectError(
      () => updateSettings(db, ctxOf("admin"), inputOf("   ")),
      422,
      "SETTINGS_NAME_INVALID",
    );
    expectError(
      () => updateSettings(db, ctxOf("admin"), inputOf("x".repeat(81))),
      422,
      "SETTINGS_NAME_INVALID",
    );
    expectError(
      () => updateSettings(db, ctxOf("admin"), inputOf("Ok", "JPY")),
      422,
      "SETTINGS_CURRENCY_INVALID",
    );
    expect(getSettings(db)).toEqual(DEFAULTS);
    expect(settingsEvents(db)).toHaveLength(0);
  });

  test("one event per change with a diff of only the changed fields", () => {
    const db = createTestDb();
    updateSettings(db, ctxOf("admin"), inputOf("Mein Zuhause", "CHF"));
    const first = settingsEvents(db);
    expect(first).toHaveLength(1);
    expect(first[0]!.action).toBe("settings.updated");
    expect(first[0]!.actorId).toBe("actor-admin");
    expect(first[0]!.diff).toEqual({
      householdName: { from: "Unser Haushalt", to: "Mein Zuhause" },
      currency: { from: "EUR", to: "CHF" },
    });

    // Identical values are a no-op: no second event.
    updateSettings(db, ctxOf("admin"), inputOf("Mein Zuhause", "CHF"));
    expect(settingsEvents(db)).toHaveLength(1);

    // Changing just one field logs just that field.
    updateSettings(db, ctxOf("admin"), inputOf("Anderes Zuhause", "CHF"));
    const second = settingsEvents(db);
    expect(second).toHaveLength(2);
    expect(second[1]!.diff).toEqual({
      householdName: { from: "Mein Zuhause", to: "Anderes Zuhause" },
    });
  });
});
