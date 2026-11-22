// Editing: optimistic locking made visible, and changing an item's type.
import { expect, test } from "./fixtures";
import { addItem, hydrated, selectByText, token } from "./item-helpers";

test("two people edit one item: the second keeps their input and reapplies it", async ({
  newUser,
}) => {
  const a = await newUser("member");
  const b = await newUser("member");
  const t = token();
  // Household-owned: every member may edit it.
  const id = await addItem(a.page, { type: "Werkzeug", name: `Leiter ${t}` });

  await a.page.goto(`/items/${id}/edit`);

  await hydrated(a.page);
  await b.page.goto(`/items/${id}/edit`);
  await hydrated(b.page);
  await expect(b.page.getByRole("textbox", { name: /^Name/ })).toHaveValue(`Leiter ${t}`);

  await a.page.getByRole("textbox", { name: /^Name/ }).fill(`Stehleiter ${t}`);
  await a.page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(a.page.getByRole("heading", { level: 1, name: `Stehleiter ${t}` })).toBeVisible();

  await b.page.getByLabel("Beschreibung").fill("Steht im Keller");
  await b.page.getByRole("button", { name: "Speichern", exact: true }).click();
  const conflict = b.page.getByTestId("edit-conflict");
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText("Jemand anders hat diesen Gegenstand inzwischen geändert.");
  await expect(conflict).toContainText(`Name: Stehleiter ${t}`);
  // Input is still there.
  await expect(b.page.getByLabel("Beschreibung")).toHaveValue("Steht im Keller");

  await conflict.getByRole("button", { name: "Meine Änderungen übernehmen" }).click();
  await expect(b.page).toHaveURL(new RegExp(`/items/${id}$`));
  await expect(b.page.getByRole("heading", { level: 1, name: `Stehleiter ${t}` })).toBeVisible();
  await expect(
    b.page.getByRole("region", { name: "Angaben" }).getByText("Steht im Keller"),
  ).toBeVisible();
});

test("leaving the edit page with unsaved changes asks first", async ({ newUser }) => {
  const a = await newUser("member");
  const id = await addItem(a.page, { type: "Werkzeug", name: `Zange ${token()}` });
  await a.page.goto(`/items/${id}/edit`);
  await hydrated(a.page);
  await a.page.getByLabel("Zustand").fill("gut");
  let asked = false;
  a.page.once("dialog", async (d) => {
    asked = true;
    await d.dismiss();
  });
  await a.page.getByRole("link", { name: "Abbrechen" }).first().click();
  await expect(a.page).toHaveURL(new RegExp(`/items/${id}/edit$`));
  expect(asked).toBe(true);
});

test("change the type with the migration preview", async ({ newUser }) => {
  const a = await newUser("member");
  const t = token();
  const id = await addItem(a.page, {
    type: "Werkzeug",
    name: `Arbeitsjacke ${t}`,
    more: (p) => p.getByLabel("Marke").fill("Engelbert"),
  });
  const page = a.page;
  await page.getByRole("button", { name: "Art ändern" }).click();
  const dialog = page.getByRole("dialog");
  await selectByText(dialog.getByLabel("Neue Art"), /Kleidung/);
  await dialog.getByRole("button", { name: "Vorschau" }).click();
  const preview = dialog.getByTestId("type-preview");
  await expect(preview).toContainText("So wird der Gegenstand zu „Kleidung“");
  await expect(preview.getByTestId("plan-legacy")).toContainText("Marke");
  await dialog.getByRole("button", { name: "Art ändern" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByText("Kleidung").first()).toBeVisible();
  // The old value is kept under "Alte Felder".
  await expect(page.getByText("Alte Felder")).toBeVisible();
  await expect(page.getByRole("region", { name: /^Felder/ }).getByText("Engelbert")).toBeVisible();
  await expect(page.getByRole("list", { name: "Verlauf" }).getByText("Art geändert")).toBeVisible();
  expect(page.url()).toContain(id);
});
