// Locations: nested create, move an item in, browse, breadcrumbs.
import { expect, test } from "./fixtures";
import { addItem, hydrated, selectByText, token } from "./item-helpers";

test("create nested locations, move an item there and browse to it", async ({ newUser }) => {
  const u = await newUser("member");
  const page = u.page;
  const t = token();
  const keller = `Keller ${t}`;
  const regal = `Regal ${t}`;

  await page.goto("/locations");

  await hydrated(page);
  await page.getByLabel("Name", { exact: true }).fill(keller);
  await page.getByLabel("Art des Orts").selectOption("room");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await page.getByRole("link", { name: new RegExp(keller) }).click();
  await expect(page.getByRole("heading", { level: 1, name: keller })).toBeVisible();
  await expect(page.getByTestId("location-short-code")).toHaveText(/[A-Z0-9]{4,}/);

  await page.getByLabel("Name", { exact: true }).fill(regal);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await page
    .getByRole("region", { name: "Unterorte" })
    .getByRole("link", { name: new RegExp(regal) })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: regal })).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Pfad" });
  await expect(crumbs.getByRole("listitem")).toHaveText([
    /Orte/,
    new RegExp(keller),
    new RegExp(regal),
  ]);

  const item = `Akkubohrer ${t}`;
  const id = await addItem(page, { type: "Werkzeug", name: item });
  await page.getByRole("button", { name: "Umräumen" }).click();
  const dialog = page.getByRole("dialog");
  await selectByText(dialog.getByLabel("Ort", { exact: true }), new RegExp(regal));
  await dialog.getByRole("button", { name: "Hierhin räumen" }).click();
  await expect(dialog).toHaveCount(0);

  const place = page.getByRole("navigation", { name: `Ort von ${item}` });
  await expect(place.getByRole("link")).toHaveText([keller, regal]);
  await place.getByRole("link", { name: regal }).click();
  await expect(page.getByRole("heading", { level: 1, name: regal })).toBeVisible();
  await expect(
    page.getByRole("list", { name: `Gegenstände in ${regal}` }).getByText(item),
  ).toBeVisible();

  // The parent counts it including sub-locations.
  await page.getByRole("navigation", { name: "Pfad" }).getByRole("link", { name: keller }).click();
  await expect(page.getByText("0 direkt hier, 1 insgesamt")).toBeVisible();
  expect(id).toBeTruthy();
});
