// Items: quick add with a photo on the phone, German search, URL filters,
// the not-found page.
import { expect, test } from "./fixtures";
import { addItem, hydrated, results, searchItems, selectByText, token } from "./item-helpers";

test("quick add with a photo, then find it by part of a compound word and without umlauts", async ({
  newUser,
}) => {
  const u = await newUser("member");
  const page = u.page;
  const t = token();
  const name = `Quarkkreissäge ${t}`;
  await addItem(page, { type: "Werkzeug", name, photo: true });

  // The photo was uploaded after the item existed and shows in the gallery.
  const gallery = page.getByTestId("photo-gallery");
  await expect(gallery.getByRole("img")).toHaveCount(1);

  // Substring of the compound word …
  await searchItems(page, `kreissäg ${t}`);
  await expect(results(page).getByText(name)).toBeVisible();
  // … and umlaut-/case-insensitive.
  await searchItems(page, `QUARKKREISSAGE ${t}`);
  const card = results(page).getByTestId("item-card").filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toHaveCount(1); // cover thumbnail (decorative)
  await expect(page.getByRole("status").filter({ hasText: "1 Gegenstand" })).toBeVisible();

  await card.click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});

test("an unknown item id shows the friendly not-found page", async ({ adminPage }) => {
  const res = await adminPage.goto("/items/00000000-0000-7000-8000-000000000000");
  await hydrated(adminPage);
  expect(res?.status()).toBe(404);
  await expect(adminPage.getByRole("heading", { name: "Gegenstand nicht gefunden" })).toBeVisible();
  await expect(adminPage.getByRole("link", { name: "Zu den Gegenständen" })).toBeVisible();
  await adminPage.goto("/items/not-even-a-uuid");
  await hydrated(adminPage);
  await expect(adminPage.getByRole("heading", { name: "Gegenstand nicht gefunden" })).toBeVisible();
});

test("filters live in the URL: subtypes included, attribute filter, reload and back", async ({
  newUser,
}) => {
  const u = await newUser("member");
  const page = u.page;
  const t = token();
  await addItem(page, { type: "Werkzeug", name: `Hobel ${t}` });
  await addItem(page, {
    type: "Elektrowerkzeug",
    name: `Bohrmaschine ${t}`,
    more: (p) => p.getByLabel("Energiequelle").selectOption("Akku"),
  });
  await addItem(page, {
    type: "Elektrowerkzeug",
    name: `Kettensäge ${t}`,
    more: (p) => p.getByLabel("Energiequelle").selectOption("Benzin"),
  });
  await addItem(page, { type: "Kleidung", name: `Jacke ${t}` });

  await searchItems(page, t);
  await expect(results(page).getByRole("link")).toHaveCount(4);

  // Type "Werkzeug" includes its subtype "Elektrowerkzeug".
  await page.getByRole("button", { name: /^Filter( \(\d+\))?$/ }).click();
  const sheet = page.getByRole("dialog");
  await selectByText(sheet.getByLabel("Art", { exact: true }), /^Werkzeug \(/);
  await expect(page).toHaveURL(/type=/);
  await sheet.getByRole("button", { name: /anzeigen$/ }).click();
  await expect(results(page).getByRole("link")).toHaveCount(3);
  await expect(results(page).getByText(`Jacke ${t}`)).toHaveCount(0);

  await page.reload();

  await hydrated(page);
  await expect(results(page).getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("searchbox")).toHaveValue(t);
  const werkzeugUrl = page.url();

  // Attribute filter of the subtype.
  await page.getByRole("button", { name: /^Filter( \(\d+\))?$/ }).click();
  await selectByText(sheet.getByLabel("Art", { exact: true }), /Elektrowerkzeug/);
  await expect(sheet.getByText("Felder der Art")).toBeVisible();
  await sheet.getByText(/^Akku \(/).click();
  await expect(sheet.getByRole("checkbox", { name: /^Akku/ })).toBeChecked();
  await expect(page).toHaveURL(/attr=/);
  await sheet.getByRole("button", { name: /anzeigen$/ }).click();
  await expect(results(page).getByRole("link")).toHaveCount(1);
  await expect(results(page).getByText(`Bohrmaschine ${t}`)).toBeVisible();

  await page.reload();

  await hydrated(page);
  await expect(results(page).getByRole("link")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /^Filter entfernen: Energiequelle: Akku/ }),
  ).toBeVisible();

  // Back from an item returns to the filtered list.
  await results(page).getByText(`Bohrmaschine ${t}`).click();
  await expect(page.getByRole("heading", { level: 1, name: `Bohrmaschine ${t}` })).toBeVisible();
  await page.goBack();
  await hydrated(page);
  await expect(page).toHaveURL(/attr=/);
  await expect(results(page).getByRole("link")).toHaveCount(1);
  await page.goForward();
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 1, name: `Bohrmaschine ${t}` })).toBeVisible();
  await page.goto(werkzeugUrl);
  await hydrated(page);
  await expect(results(page).getByRole("link")).toHaveCount(3);

  // Removing a chip clears that filter.
  await page.getByRole("button", { name: /^Filter entfernen: Werkzeug/ }).click();
  await expect(results(page).getByRole("link")).toHaveCount(4);
});
