// Price range and "Ohne Ort" filters in the items list (URL state), the
// link from the locations page, and quick add with a type's required field.
import { expect, test } from "./fixtures";
import { addItem, hydrated, results, token } from "./item-helpers";

test("price range filter: in the URL, only items in range", async ({ adminPage: page }) => {
  const t = token();
  for (const [name, price] of [
    [`${t} billig`, "5"],
    [`${t} mittel`, "25,50"],
    [`${t} teuer`, "300"],
  ] as const)
    await addItem(page, {
      type: "Werkzeug",
      name,
      more: async (p) => p.getByLabel("Preis (EUR)").fill(price),
    });
  await page.goto(`/items?q=${t}`);
  await hydrated(page);
  await page.getByRole("button", { name: /^Filter/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("group", { name: "Preis (€)" }).getByLabel("von").fill("10");
  await dialog.getByRole("group", { name: "Preis (€)" }).getByLabel("von").press("Tab");
  // Right away, before the URL has caught up with "von".
  await dialog.getByRole("group", { name: "Preis (€)" }).getByLabel("bis").fill("100");
  await dialog.getByRole("group", { name: "Preis (€)" }).getByLabel("bis").press("Tab");
  await expect(page).toHaveURL(/pmin=10/);
  await expect(page).toHaveURL(/pmax=100/);
  await dialog.getByRole("button", { name: /anzeigen$/ }).click();
  await expect(results(page).getByText(`${t} mittel`)).toBeVisible();
  await expect(results(page).getByText(`${t} billig`)).toHaveCount(0);
  await expect(results(page).getByText(`${t} teuer`)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Filter entfernen: Preis: 10–100 €/ }),
  ).toBeVisible();
  // A reload keeps it (URL state).
  await page.reload();
  await expect(results(page).getByText(`${t} mittel`)).toBeVisible();
  await expect(results(page).getByText(`${t} teuer`)).toHaveCount(0);
});

test("a guest never gets the price filter", async ({ newUser }) => {
  const g = await newUser("guest");
  await g.page.goto("/items");
  await hydrated(g.page);
  await g.page.getByRole("button", { name: /^Filter/ }).click();
  await expect(g.page.getByRole("dialog").getByText("Preis (€)")).toHaveCount(0);
});

test("items without a location: linked from the locations page, filterable", async ({
  adminPage: page,
}) => {
  const t = token();
  await addItem(page, { type: "Werkzeug", name: `${t} lose` });
  await page.goto("/locations");
  await hydrated(page);
  await page.getByRole("link", { name: /Ohne Ort/ }).click();
  await expect(page).toHaveURL(/\/items\?unplaced=true|\/items\?unplaced=1/);
  await expect(results(page).getByText(`${t} lose`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter entfernen: Ohne Ort" })).toBeVisible();
  // The filter dialog shows it as the chosen location option.
  await page.getByRole("button", { name: /^Filter \(/ }).click();
  await expect(page.getByRole("dialog").getByLabel("Ort")).toHaveValue("__unplaced");
});

test("quick add a book: its required field is shown up front, no hidden error", async ({
  adminPage: page,
}) => {
  const t = token();
  await page.goto("/items/new");
  await hydrated(page);
  const radio = page.getByRole("radio", { name: "Buch", exact: true });
  await page.locator("label", { has: radio }).click();
  await page.getByRole("textbox", { name: /^Name/ }).fill(`${t} Roman`);
  const authors = page.getByLabel("Autor(en) 1");
  await expect(authors).toBeVisible(); // without opening "Weitere Angaben"
  await expect(page.locator("details")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  // The error sits on the visible field, which gets focus; the rest stays closed.
  await expect(authors).toBeFocused();
  await expect(authors).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("details")).not.toHaveAttribute("open", "");
  await authors.fill("Erich Kästner");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("region", { name: "Felder: Buch" })).toContainText("Erich Kästner");
  // History: one compact "Angelegt" entry; initial values stay collapsed.
  const created = page.getByRole("list", { name: "Verlauf" }).getByRole("listitem").last();
  await expect(created).toContainText(`${t} Roman`);
  await expect(created.getByText("Erich Kästner")).toBeHidden();
  await created.getByText(/^Anfangswerte/).click();
  await expect(created.getByText("Erich Kästner")).toBeVisible();
});
