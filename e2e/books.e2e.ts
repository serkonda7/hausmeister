// ISBN auto-fill and shelf mode (DESIGN §5.2). The e2e server runs with
// ISBN_LOOKUP=off (no calls to the real libraries), so lookups answer
// "unavailable": these tests cover validation, duplicates and the hand-off
// to quick add; the parsers and the source chain are unit-tested.
import { expect, test } from "./fixtures";
import { addItem, hydrated, token } from "./item-helpers";

test("quick add: ISBN box for books, checksum first, offline answer", async ({ newUser }) => {
  const { page } = await newUser("member");
  await page.goto("/items/new");
  await hydrated(page);
  const book = page.getByRole("radio", { name: "Buch", exact: true });
  await page.locator("label", { has: book }).click();
  const box = page.getByRole("region", { name: "Buchdaten per ISBN" });
  await box.getByLabel("ISBN").fill("978-3-257-07148-2");
  await box.getByRole("button", { name: "Daten abrufen" }).click();
  await expect(box.getByRole("status")).toContainText("Prüfziffer");
  await box.getByLabel("ISBN").fill("978-3-257-07148-1");
  await box.getByRole("button", { name: "Daten abrufen" }).click();
  await expect(box.getByRole("status")).toContainText("nicht erreichbar");
});

test("shelf mode: new ISBNs need input, known ones are flagged", async ({ adminPage: page }) => {
  // An existing book with this ISBN-10; the shelf scan uses the ISBN-13.
  const name = `Hard land ${token()}`;
  await addItem(page, {
    type: "Buch",
    name,
    more: async (p) => {
      // "Autor(en)" is required on the starter type.
      await p
        .getByRole("textbox", { name: /^Autor\(en\)/ })
        .first()
        .fill("Benedict Wells");
      await p.locator("#new-attr-isbn").fill("3257071485");
    },
  });
  await page.goto("/items/shelf");
  await hydrated(page);
  await expect(page.getByLabel("Art", { exact: true })).toHaveValue(/.+/);
  const field = page.getByLabel("ISBN eintippen");

  await field.fill("9783257071481");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  const known = page.getByTestId("shelf-entry").filter({ hasText: "9783257071481" });
  await expect(known).toContainText("Schon vorhanden");
  await expect(known.getByRole("link", { name })).toBeVisible();

  await field.fill("9780140328721");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  const unknown = page.getByTestId("shelf-entry").filter({ hasText: "9780140328721" });
  await expect(unknown).toContainText("Angaben fehlen");
  await unknown.getByRole("link", { name: "Selbst ausfüllen" }).click();
  await expect(page).toHaveURL(/\/items\/new\?.*isbn=(%22)?9780140328721/);
  await hydrated(page);
  await expect(
    page.getByRole("region", { name: "Buchdaten per ISBN" }).getByLabel("ISBN"),
  ).toHaveValue("9780140328721");

  await page.goto("/items/shelf");
  await hydrated(page);
  await page.getByLabel("ISBN eintippen").fill("12345");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("12345 ist keine gültige ISBN.")).toBeVisible();
});
