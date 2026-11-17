// Admin pages built on existing server functions: household settings, tags,
// and reassigning a user's items.
import { execFileSync } from "node:child_process";
import { E2E_DB } from "./env";
import { expect, test, uniqueName } from "./fixtures";

/** Inserts tags straight into the e2e database (tags normally appear via items). */
function seedTags(names: string[]) {
  const script = `
    import { Database } from "bun:sqlite";
    const db = new Database(process.env.DB);
    for (const name of JSON.parse(process.env.NAMES)) {
      db.run("insert into tags (id, name) values (?, ?)", [crypto.randomUUID(), name]);
    }
    db.close();`;
  execFileSync("bun", ["-e", script], {
    env: { ...process.env, DB: E2E_DB, NAMES: JSON.stringify(names) },
  });
}

test("admin changes the household settings", async ({ adminPage: page }) => {
  await page.goto("/admin/settings");
  const name = page.getByLabel("Name des Haushalts");
  const currency = page.getByLabel("Währung");
  await expect(name).toHaveValue(/.+/);
  await expect(currency).toHaveValue("EUR");

  await name.fill("Familie Test");
  await currency.selectOption("CHF");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Einstellungen gespeichert")).toBeVisible();

  await page.reload();
  await expect(name).toHaveValue("Familie Test");
  await expect(currency).toHaveValue("CHF");

  // Server-side validation answers with the specific German text.
  await name.fill("   ");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Bitte einen Namen mit 1 bis 80 Zeichen eingeben.")).toBeVisible();

  // Leave the defaults behind for other tests.
  await name.fill("Unser Haushalt");
  await currency.selectOption("EUR");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Einstellungen gespeichert").last()).toBeVisible();
});

test("admin renames, recolours, merges and deletes tags", async ({ adminPage: page }) => {
  const [a, b, c] = [uniqueName("winter"), uniqueName("sommer"), uniqueName("garten")];
  seedTags([a, b, c]);
  await page.goto("/admin/tags");
  const card = (n: string) =>
    page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: n, exact: true }) });
  await expect(card(a)).toBeVisible();

  // No horizontal scrolling at phone width.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);

  // Rename.
  const renamed = `${a}x`;
  await card(a).getByRole("button", { name: "Umbenennen" }).click();
  await card(a).getByLabel("Name").fill(renamed);
  await card(a).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Schlagwort umbenannt.")).toBeVisible();
  await expect(card(renamed)).toBeVisible();

  // A duplicate name is refused with a specific message, not the generic one.
  await card(b).getByRole("button", { name: "Umbenennen" }).click();
  await card(b).getByLabel("Name").fill(c);
  await card(b).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText(/Schlagwort.*(gibt es|existiert|vergeben)/i)).toBeVisible();
  await card(b).getByRole("button", { name: "Abbrechen" }).click();

  // Recolour.
  await card(c).getByRole("button", { name: "Farbe ändern" }).click();
  await card(c).getByRole("button", { name: "Grün" }).click();
  await expect(page.getByText("Farbe geändert.")).toBeVisible();

  // Merge b into c.
  await card(b).getByRole("button", { name: "Zusammenführen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").selectOption({ label: c });
  await dialog.getByRole("button", { name: "Zusammenführen" }).click();
  await expect(page.getByText(/Schlagwörter zusammengeführt/)).toBeVisible();
  await expect(card(b)).toHaveCount(0);

  // Delete.
  await card(renamed).getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByText(/Schlagwort gelöscht/)).toBeVisible();
  await expect(card(renamed)).toHaveCount(0);
  await expect(card(c)).toBeVisible();
});

test("admin reassigns a user's items", async ({ adminPage: page, newUser }) => {
  const ben = await newUser("member", `Ben ${uniqueName("r").slice(-5)}`);
  const guest = await newUser("guest", `Gast ${uniqueName("g").slice(-5)}`);
  await page.goto("/admin/users");
  const row = page.getByRole("listitem").filter({ hasText: ben.displayName });
  await row.getByRole("button", { name: "Gegenstände übertragen …" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(`Alle Gegenstände von ${ben.displayName} übertragen an:`),
  ).toBeVisible();
  const options = await dialog.getByRole("combobox").locator("option").allInnerTexts();
  expect(options[0]).toBe("Haushalt");
  expect(options).not.toContain(ben.displayName);
  expect(options).not.toContain(guest.displayName);

  await dialog.getByRole("button", { name: "Übertragen" }).click();
  await expect(page.getByText("0 Gegenstände übertragen")).toBeVisible();
});
