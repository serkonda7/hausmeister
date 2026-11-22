// Item relations on the item page (a spare part that fits a device, with its stock on the device's side) and the warranty reminder state of an electronics item.
import { expect, test } from "./fixtures";
import { addItem, hydrated, results, token } from "./item-helpers";

/** 'YYYY-MM-DD' n days from now (Berlin and UTC agree away from midnight; the window is 30 days wide). */
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test("a spare part that fits: added on its page, listed with its stock on the device", async ({
  adminPage: page,
}) => {
  const t = token();
  const vacuum = await addItem(page, { type: "Werkzeug", name: `${t} Staubsauger` });
  await addItem(page, { type: "Ersatzteil", name: `${t} Beutel` });
  await hydrated(page);

  await page.getByRole("button", { name: "Beziehung hinzufügen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Art der Beziehung")
    .selectOption({ label: "Dieser Gegenstand passt zu …" });
  await dialog.getByRole("combobox", { name: "Anderer Gegenstand" }).fill(`${t} Staub`);
  await dialog.getByRole("option", { name: `${t} Staubsauger` }).click();
  await dialog.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(dialog).toBeHidden();

  const own = page.getByRole("list", { name: "Passt zu" });
  await expect(own.getByRole("link", { name: new RegExp(`${t} Staubsauger`) })).toBeVisible();

  await page.goto(`/items/${vacuum}`);
  await hydrated(page);
  const parts = page.getByRole("list", { name: "Passende Teile" });
  const row = parts.getByTestId("relation-row");
  await expect(row.getByRole("link", { name: new RegExp(`${t} Beutel`) })).toBeVisible();
  await expect(row.getByTestId("relation-stock")).toContainText("Bestand: 1");
  await expect(page.getByText(`Passende Teile: ${t} Beutel`)).toBeVisible(); // history

  await row.getByRole("button", { name: `Beziehung zu ${t} Beutel entfernen` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Entfernen" }).click();
  await expect(parts).toHaveCount(0);
});

test("warranty ending soon: badge on the item, the list filter and the home page", async ({
  adminPage: page,
}) => {
  const t = token();
  await addItem(page, {
    type: "Elektronik",
    name: `${t} Fernseher`,
    more: (p) => p.getByLabel("Garantie bis").fill(inDays(10)),
  });
  await expect(page.getByTestId("warranty-state")).toHaveText(/Garantie endet in (9|10|11) Tagen/);
  await addItem(page, {
    type: "Elektronik",
    name: `${t} Kühlschrank`,
    more: (p) => p.getByLabel("Garantie bis").fill(inDays(200)),
  });
  await expect(page.getByTestId("warranty-state")).toHaveCount(0);

  await page.goto(`/items?warranty=1&q=${t}`);
  await hydrated(page);
  await expect(results(page).getByText(`${t} Fernseher`)).toBeVisible();
  await expect(results(page).getByText(`${t} Kühlschrank`)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Filter entfernen: Garantie endet bald" }),
  ).toBeVisible();

  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Garantie endet bald" }).getByText(`${t} Fernseher`),
  ).toBeVisible();
});
