// Test helper: a fresh in-memory database with every migration applied.
// Each call returns an independent database, so tests never share state.
import { type AppDb, openDatabase } from "./client";

export function createTestDb(): AppDb {
  return openDatabase(":memory:");
}
