import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createContact, deleteContact, listContacts } from "../contacts/service";
import { items, loans } from "../db/schema";
import { getItemHistory } from "../history/service";
import { ItemsError } from "../items/errors";
import { setItemGrant, setItemStatus } from "../items/service";
import { setupFixture } from "../items/test-fixtures";
import { listNotifications } from "../notifications/service";
import {
  approveLoan,
  cancelLoan,
  checkoutItem,
  declineLoan,
  getItemLoans,
  getLoanOverview,
  handOverLoan,
  requestLoan,
  returnLoan,
  setLoanDue,
} from "./service";

function code(fn: () => unknown): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof ItemsError ? e.code : (e as Error).message;
  }
}

function loanFixture() {
  const f = setupFixture();
  const drill = f.item(f.admin, { name: "Bohrmaschine" });
  const annas = f.item(f.anna, {
    name: "Annas Säge",
    owner: { ownerKind: "user", ownerId: f.anna.userId },
  });
  const secret = f.item(f.anna, {
    name: "Tagebuch",
    owner: { ownerKind: "user", ownerId: f.anna.userId },
    visibility: "private",
  });
  const status = (id: string) =>
    f.db.select({ s: items.status }).from(items).where(eq(items.id, id)).get()?.s;
  const version = (id: string) =>
    f.db.select({ v: items.version }).from(items).where(eq(items.id, id)).get()?.v ?? 1;
  return { ...f, drill, annas, secret, status, version };
}

describe("direct check-out (use)", () => {
  test("household item: check out, item on loan, nobody else can, return", () => {
    const f = loanFixture();
    const { loanId } = checkoutItem(f.db, f.anna, { itemId: f.drill.id, dueOn: "2026-12-01" });
    expect(f.status(f.drill.id)).toBe("on_loan");
    expect(code(() => checkoutItem(f.db, f.ben, { itemId: f.drill.id }))).toBe("LOAN_UNAVAILABLE");
    const view = getItemLoans(f.db, f.ben, f.drill.id);
    expect(view.available).toBe(0);
    expect(view.open).toHaveLength(1);
    expect(view.open[0]).toMatchObject({
      status: "out",
      dueOn: "2026-12-01",
      borrower: { kind: "user", name: "Anna" },
      mine: false,
    });
    // Ben has use on household items, so he may take it back in.
    expect(view.open[0]?.actions.return).toBe(true);
    returnLoan(f.db, f.ben, { loanId });
    expect(f.status(f.drill.id)).toBe("available");
    expect(getItemLoans(f.db, f.ben, f.drill.id)).toMatchObject({ open: [], available: 1 });
  });

  test("viewers cannot check out; invisible items are not found; gone items cannot go out", () => {
    const f = loanFixture();
    expect(code(() => checkoutItem(f.db, f.ben, { itemId: f.annas.id }))).toBe("ITEM_FORBIDDEN");
    expect(code(() => checkoutItem(f.db, f.ben, { itemId: f.secret.id }))).toBe("ITEM_NOT_FOUND");
    expect(code(() => requestLoan(f.db, f.ben, { itemId: f.secret.id }))).toBe("ITEM_NOT_FOUND");
    setItemStatus(f.db, f.admin, {
      id: f.drill.id,
      version: f.version(f.drill.id),
      status: "sold",
    });
    expect(code(() => checkoutItem(f.db, f.anna, { itemId: f.drill.id }))).toBe("LOAN_ITEM_GONE");
    expect(code(() => requestLoan(f.db, f.anna, { itemId: f.drill.id }))).toBe("LOAN_ITEM_GONE");
  });

  test("lending to other people and contacts; guests only for themselves", () => {
    const f = loanFixture();
    const tom = createContact(f.db, f.anna, { name: "Nachbar Tom", phone: "0171 123" });
    const { loanId } = checkoutItem(f.db, f.anna, {
      itemId: f.drill.id,
      borrower: { kind: "contact", id: tom.id },
    });
    expect(getItemLoans(f.db, f.anna, f.drill.id).open[0]?.borrower).toEqual({
      kind: "contact",
      id: tom.id,
      name: "Nachbar Tom",
    });
    expect(code(() => deleteContact(f.db, f.anna, tom.id))).toBe("CONTACT_IN_USE");
    expect(listContacts(f.db, f.ben)[0]).toMatchObject({ name: "Nachbar Tom", openLoans: 1 });
    returnLoan(f.db, f.anna, { loanId });
    deleteContact(f.db, f.anna, tom.id);
    const row = f.db.select().from(loans).where(eq(loans.id, loanId)).get();
    expect(row?.borrowerContactId).toBeNull();
    // The history keeps the name.
    const lent = getItemHistory(f.db, f.anna, { itemId: f.drill.id }).entries.find(
      (e) => e.action === "item.lent",
    );
    expect(lent?.diff).toMatchObject({ borrowerName: "Nachbar Tom" });

    const box = f.item(f.admin, { name: "Kinderbuch" });
    setItemGrant(f.db, f.admin, {
      itemId: box.id,
      principalKind: "user",
      principalId: f.gast.userId,
      level: "use",
    });
    expect(
      code(() =>
        checkoutItem(f.db, f.gast, { itemId: box.id, borrower: { kind: "contact", id: "x" } }),
      ),
    ).toBe("ITEM_FORBIDDEN");
    expect(
      code(() =>
        checkoutItem(f.db, f.gast, {
          itemId: box.id,
          borrower: { kind: "user", id: f.gast.userId },
        }),
      ),
    ).toBe("OK");
    expect(code(() => listContacts(f.db, f.gast))).toBe("ITEM_FORBIDDEN");
    expect(
      code(() =>
        checkoutItem(f.db, f.anna, {
          itemId: f.annas.id,
          borrower: { kind: "user", id: "nobody" },
        }),
      ),
    ).toBe("LOAN_BORROWER_INVALID");
  });

  test("stock items lend quantities and keep their status", () => {
    const f = loanFixture();
    const clamps = f.item(f.admin, {
      name: "Schraubzwingen",
      typeId: f.other.id,
      attributes: { shop: "x" },
      quantity: 10,
    });
    checkoutItem(f.db, f.anna, { itemId: clamps.id, quantity: 4 });
    checkoutItem(f.db, f.ben, { itemId: clamps.id, quantity: 6 });
    expect(code(() => checkoutItem(f.db, f.ben, { itemId: clamps.id, quantity: 1 }))).toBe(
      "LOAN_UNAVAILABLE",
    );
    expect(f.status(clamps.id)).toBe("available");
    expect(getItemLoans(f.db, f.anna, clamps.id)).toMatchObject({
      tracking: "stock",
      available: 0,
    });
    expect(code(() => checkoutItem(f.db, f.anna, { itemId: f.drill.id, quantity: 2 }))).toBe(
      "LOAN_QUANTITY",
    );
  });
});

describe("requests (view) and approval (manage)", () => {
  test("request, notice to the owner, approve and hand over, notice to the borrower, return", () => {
    const f = loanFixture();
    const { loanId } = requestLoan(f.db, f.ben, {
      itemId: f.annas.id,
      dueOn: "2026-12-24",
      note: "Für das Baumhaus",
    });
    expect(code(() => requestLoan(f.db, f.ben, { itemId: f.annas.id }))).toBe("LOAN_DUPLICATE");
    expect(listNotifications(f.db, f.anna).entries[0]).toMatchObject({
      kind: "loan.requested",
      payload: { actorName: "Ben", dueOn: "2026-12-24" },
    });
    // Ben sees his own request, Admin (manage) sees it; Ben cannot approve it.
    expect(getItemLoans(f.db, f.ben, f.annas.id)).toMatchObject({
      open: [{ status: "requested", mine: true, actions: { cancel: true, approve: false } }],
      canRequest: false,
    });
    expect(code(() => approveLoan(f.db, f.ben, { loanId }))).toBe("ITEM_FORBIDDEN");

    approveLoan(f.db, f.anna, { loanId, handOver: true });
    expect(f.status(f.annas.id)).toBe("on_loan");
    expect(listNotifications(f.db, f.ben).entries[0]).toMatchObject({
      kind: "loan.approved",
      payload: { actorName: "Anna", dueOn: "2026-12-24" },
    });
    // The borrower may return it.
    returnLoan(f.db, f.ben, { loanId });
    expect(f.status(f.annas.id)).toBe("available");
  });

  test("approve without hand-over, then the borrower picks it up", () => {
    const f = loanFixture();
    const { loanId } = requestLoan(f.db, f.ben, { itemId: f.annas.id });
    approveLoan(f.db, f.anna, { loanId, dueOn: "2026-12-01" });
    expect(f.status(f.annas.id)).toBe("available");
    expect(code(() => returnLoan(f.db, f.ben, { loanId }))).toBe("LOAN_STATE");
    handOverLoan(f.db, f.ben, { loanId });
    expect(f.db.select().from(loans).where(eq(loans.id, loanId)).get()).toMatchObject({
      status: "out",
      dueOn: "2026-12-01",
      lentBy: f.ben.userId,
    });
  });

  test("decline notifies; cancel is the borrower's; others cannot even see the request", () => {
    const f = loanFixture();
    const a = requestLoan(f.db, f.ben, { itemId: f.annas.id });
    expect(code(() => declineLoan(f.db, f.gast, a))).toBe("LOAN_NOT_FOUND");
    declineLoan(f.db, f.anna, a);
    expect(listNotifications(f.db, f.ben).entries[0]?.kind).toBe("loan.declined");
    expect(code(() => cancelLoan(f.db, f.ben, a))).toBe("LOAN_STATE");
    const b = requestLoan(f.db, f.ben, { itemId: f.annas.id });
    expect(code(() => cancelLoan(f.db, f.anna, b))).toBe("ITEM_FORBIDDEN");
    cancelLoan(f.db, f.ben, b);
    expect(getItemLoans(f.db, f.anna, f.annas.id).open).toEqual([]);
  });

  test("history: request events only for managers, hand-outs for every viewer", () => {
    const f = loanFixture();
    const { loanId } = requestLoan(f.db, f.ben, { itemId: f.annas.id });
    approveLoan(f.db, f.anna, { loanId, handOver: true });
    const forBen = getItemHistory(f.db, f.ben, { itemId: f.annas.id }).entries.map((e) => e.action);
    expect(forBen).toContain("item.lent");
    expect(forBen).not.toContain("item.loan_requested");
    expect(forBen).not.toContain("item.loan_approved");
    const forAnna = getItemHistory(f.db, f.anna, { itemId: f.annas.id });
    expect(forAnna.entries.map((e) => e.action)).toContain("item.loan_requested");
    expect(forAnna.names.users[f.ben.userId]).toBe("Ben");
  });
});

describe("overview and due dates", () => {
  test("mine, requests and lent out (overdue first)", () => {
    const f = loanFixture();
    const saw = requestLoan(f.db, f.ben, { itemId: f.annas.id });
    const drill = checkoutItem(f.db, f.anna, {
      itemId: f.drill.id,
      borrower: { kind: "user", id: f.ben.userId },
      dueOn: "2026-11-01",
    });
    const hammer = f.item(f.anna, { name: "Hammer" });
    checkoutItem(f.db, f.anna, {
      itemId: hammer.id,
      borrower: { kind: "user", id: f.admin.userId },
      dueOn: "2026-12-01",
    });
    const now = new Date("2026-11-18T10:00:00Z");
    const ben = getLoanOverview(f.db, f.ben, now);
    expect(ben.mine.map((l) => [l.item.name, l.status, l.overdue])).toEqual([
      ["Annas Säge", "requested", false],
      ["Bohrmaschine", "out", true],
    ]);
    const anna = getLoanOverview(f.db, f.anna, now);
    expect(anna.requests.map((l) => l.id)).toEqual([saw.loanId]);
    expect(anna.lentOut.map((l) => [l.item.name, l.overdue])).toEqual([
      ["Bohrmaschine", true],
      ["Hammer", false],
    ]);
    setLoanDue(f.db, f.anna, { loanId: drill.loanId, dueOn: null });
    expect(getLoanOverview(f.db, f.anna, now).lentOut[0]?.item.name).toBe("Hammer");
    expect(code(() => setLoanDue(f.db, f.ben, { loanId: drill.loanId, dueOn: "2027-01-01" }))).toBe(
      "OK",
    );
  });

  test("a borrower sees their loan of an item they cannot see, without its short code", () => {
    const f = loanFixture();
    checkoutItem(f.db, f.anna, {
      itemId: f.secret.id,
      borrower: { kind: "user", id: f.ben.userId },
    });
    const [row] = getLoanOverview(f.db, f.ben).mine;
    expect(row?.item).toMatchObject({ name: "Tagebuch", visible: false, shortCode: null });
    expect(row?.actions.return).toBe(true);
    returnLoan(f.db, f.ben, { loanId: row!.id });
    expect(f.status(f.secret.id)).toBe("available");
  });
});
