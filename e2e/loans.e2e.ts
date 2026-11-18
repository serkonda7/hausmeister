// Loans and stock (DESIGN §5.3, §4.2, §11 "loan request → approve"): a
// member asks for someone else's item, the owner approves and hands it over,
// the borrower returns it; a household item goes to an external contact; a
// stock item is used up below its minimum and the owners hear about it.
import { expect, test } from "./fixtures";
import { addItem, hydrated, ownMore, token } from "./item-helpers";

test("loan request → approve and hand over → return", async ({ newUser }) => {
  const anna = await newUser("member", `Anna ${token()}`);
  const ben = await newUser("member", `Ben ${token()}`);
  const name = `Leiter ${token()}`;
  const id = await addItem(anna.page, { type: "Werkzeug", name, more: ownMore() });

  // Ben may only view Anna's item: he asks for it.
  await ben.page.goto(`/items/${id}`);
  await hydrated(ben.page);
  await expect(ben.page.getByRole("button", { name: "Ausleihen", exact: true })).toHaveCount(0);
  await ben.page.getByRole("button", { name: "Ausleihe anfragen" }).click();
  await ben.page.getByLabel("Nachricht an den Besitzer (optional)").fill("Für die Dachrinne");
  await ben.page.getByRole("button", { name: "Anfrage senden" }).click();
  await expect(ben.page.getByText("Anfrage gesendet")).toBeVisible();
  await expect(ben.page.getByTestId("loan")).toContainText("Angefragt");

  // Anna sees the notice and the request, and hands the item over.
  await anna.page.goto("/");
  await expect(anna.page.getByTestId("inbox-count")).toHaveText("1");
  await anna.page.getByTestId("inbox-link").click();
  await expect(anna.page.getByTestId("notification").first()).toContainText(
    `${ben.displayName} möchte ${name} ausleihen.`,
  );
  await anna.page.goto("/loans");
  await hydrated(anna.page);
  const request = anna.page
    .getByRole("region", { name: "Anfragen an dich" })
    .getByTestId("loan")
    .filter({ hasText: name });
  await expect(request).toContainText("Für die Dachrinne");
  await request.getByRole("button", { name: "Zusagen und übergeben" }).click();
  await expect(anna.page.getByText(`${name} ist ausgeliehen`)).toBeVisible();
  await expect(
    anna.page
      .getByRole("region", { name: "Verliehen" })
      .getByTestId("loan")
      .filter({ hasText: name }),
  ).toContainText(ben.displayName);

  // Ben has it now and brings it back.
  await ben.page.goto("/loans");
  await hydrated(ben.page);
  const mine = ben.page
    .getByRole("region", { name: "Von dir ausgeliehen" })
    .getByTestId("loan")
    .filter({ hasText: name });
  await expect(mine).toContainText("Ausgeliehen");
  await mine.getByRole("button", { name: "Zurückgegeben" }).click();
  await expect(ben.page.getByText(`${name} ist zurück`)).toBeVisible();

  await anna.page.goto(`/items/${id}`);
  await expect(anna.page.getByText("Niemand hat den Gegenstand gerade ausgeliehen.")).toBeVisible();
  const history = anna.page.getByRole("region", { name: "Verlauf" });
  await expect(history.getByText("Zurückgegeben", { exact: true })).toBeVisible();
  await expect(history.getByText("Ausleihe angefragt", { exact: true })).toBeVisible();
});

test("household item to an external contact, then back", async ({ adminPage: page }) => {
  const name = `Rasenmäher ${token()}`;
  const contact = `Nachbar ${token()}`;
  const id = await addItem(page, { type: "Werkzeug", name });
  await hydrated(page);
  await page.getByRole("button", { name: "Ausleihen", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Externer Kontakt", { exact: true }).click();
  const select = dialog.getByLabel("Welcher Kontakt?");
  if (await select.isVisible()) await select.selectOption({ label: "+ Neuer Kontakt" });
  await dialog.getByLabel("Name", { exact: true }).fill(contact);
  await dialog.getByLabel("Rückgabe bis").fill("2030-01-15");
  await dialog.getByRole("button", { name: "Ausleihen", exact: true }).click();
  await expect(page.getByText(`${name} ist ausgeliehen`)).toBeVisible();

  const loan = page.getByTestId("loan");
  await expect(loan).toContainText(`${contact} · bis 15.01.2030`);
  await expect(page.getByText("Verliehen", { exact: true }).first()).toBeVisible();

  await page.goto("/contacts");
  await expect(page.getByTestId("contact").filter({ hasText: contact })).toContainText(
    "1 offene Ausleihe(n)",
  );

  await page.goto(`/items/${id}`);
  await hydrated(page);
  await page.getByTestId("loan").getByRole("button", { name: "Zurückgegeben" }).click();
  await expect(page.getByText(`${name} ist zurück`)).toBeVisible();
  await expect(page.getByText("Niemand hat den Gegenstand gerade ausgeliehen.")).toBeVisible();
});

test("stock: use one below the minimum, owners get a notice", async ({ adminPage, newUser }) => {
  const ben = await newUser("member", `Ben ${token()}`);
  const name = `Dübel ${token()}`;
  const id = await addItem(ben.page, {
    type: "Ersatzteil",
    name,
    more: async (p) => {
      await p.getByLabel("Menge", { exact: true }).fill("3");
      await p.getByLabel("Mindestbestand", { exact: true }).fill("3");
    },
  });
  await hydrated(ben.page);
  const stock = ben.page.getByTestId("stock-control");
  await expect(stock.getByTestId("stock-qty")).toContainText("3");
  await stock.getByRole("button", { name: `Eins entnehmen: ${name}` }).click();
  await expect(ben.page.getByText("Mindestbestand unterschritten")).toBeVisible();
  await expect(stock.getByTestId("stock-qty")).toContainText("2");
  await expect(stock.getByText("Wenig Bestand")).toBeVisible();

  // A household item: the admin hears about it (not Ben, who did it).
  await adminPage.goto("/notifications");
  await expect(
    adminPage.getByTestId("notification").filter({ hasText: `Wenig Bestand: ${name}` }),
  ).toBeVisible();

  await stock.getByRole("button", { name: "Bestand ändern …" }).click();
  const dialog = ben.page.getByRole("dialog");
  await dialog.getByText("Gezählt (neuer Bestand)").click();
  await dialog.getByLabel("Wie viel ist da?").fill("12");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(stock.getByTestId("stock-qty")).toContainText("12");
  await expect(stock.getByText("Wenig Bestand")).toHaveCount(0);
  await ben.page.goto(`/items/${id}`);
  await expect(
    ben.page.getByRole("region", { name: "Verlauf" }).getByText("Gezählt (neuer Bestand)"),
  ).toBeVisible();
});
