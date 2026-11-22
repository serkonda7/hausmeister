// What a scanned or typed code resolves to (scan page, quick add).
import type { ItemListRow } from "../items/types";

export type CodeLookup =
  /** A label (short code) of an item or a location the caller can see. */
  | { kind: "item"; id: string }
  | { kind: "location"; id: string }
  /**
   * A barcode or ISBN: the visible items carrying it (barcode column or any attribute value, ISBN-10 and -13 alike).
   * `isbn` is the normalized ISBN-13 when the code is a book's.
   */
  | { kind: "matches"; code: string; isbn: string | null; items: ItemListRow[] };

export type LabelEntry = {
  kind: "item" | "location";
  id: string;
  name: string;
  shortCode: string;
  /** Type name (items) or the parent path (locations), for the small print. */
  context: string;
};

export type LabelSheet = { origin: string; labels: LabelEntry[] };
