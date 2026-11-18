// QR labels and scan mode (DESIGN §5.2, §11 "scan → check out"). Headless
// Chromium has no BarcodeDetector, so these tests use the code field, which
// is the documented fallback; the label URL is what the camera would read.
import { expect, test } from "./fixtures";
import { addItem, hydrated, token } from "./item-helpers";

test("a label: /q/<code> opens the item, the sheet shows its QR code", async ({
  adminPage: page,
}) => {
  const name = `Werkzeugkoffer ${token()}`;
  const id = await addItem(page, { type: "Werkzeug", name });
  const code = (await page.getByTestId("short-code").textContent())?.replace(/^.*: /, "").trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await page.goto(`/q/${code}`);
  await expect(page).toHaveURL(new RegExp(`/items/${id}$`));

  await page.getByRole("link", { name: "Etikett drucken" }).click();
  await expect(page).toHaveURL(/\/labels\?/);
  const label = page.getByTestId("label");
  await expect(label).toHaveCount(1);
  await expect(label).toContainText(name);
  await expect(label).toContainText(code!);
  await expect(label.getByRole("img", { name: `QR-Code ${code}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "1 Etiketten drucken" })).toBeEnabled();

  await page.goto("/q/ZZZZZZ");
  await expect(page.getByRole("heading", { name: "Code nicht gefunden" })).toBeVisible();
});

test("signed out, a label link goes through the login and back", async ({ page, newUser }) => {
  const anna = await newUser("member");
  const name = `Bohrer ${token()}`;
  const id = await addItem(anna.page, { type: "Werkzeug", name });
  const code = (await anna.page.getByTestId("short-code").textContent())
    ?.replace(/^.*: /, "")
    .trim();
  await page.goto(`/q/${code}`);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel("Benutzername").fill(anna.username);
  await page.getByLabel("Passwort").fill(anna.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${id}$`));
});

test("scan → check out → return, and a barcode lookup", async ({ newUser }) => {
  const ben = await newUser("member");
  const name = `Akkuschrauber ${token()}`;
  const barcode = `40${Date.now().toString().slice(-11)}`;
  await addItem(ben.page, {
    type: "Werkzeug",
    name,
    more: async (p) => {
      await p.getByLabel("Barcode", { exact: true }).fill(barcode);
    },
  });
  const code = (await ben.page.getByTestId("short-code").textContent())
    ?.replace(/^.*: /, "")
    .trim();

  const page = ben.page;
  await page.goto("/scan");
  await hydrated(page);
  const field = page.getByLabel("Code, ISBN oder Strichcode");
  await field.fill(`https://sub.example.de/q/${code}`);
  await page.getByRole("button", { name: "Suchen", exact: true }).click();
  const result = page.getByTestId("scan-result");
  await expect(result.getByRole("link", { name })).toBeVisible();
  await result.getByRole("button", { name: "Für mich ausleihen" }).click();
  await expect(page.getByText(`${name} ist ausgeliehen`)).toBeVisible();
  await expect(result).toContainText("Verliehen");
  await result.getByRole("button", { name: "Zurückgegeben" }).click();
  await expect(page.getByText(`${name} ist zurück`)).toBeVisible();
  await expect(result.getByRole("button", { name: "Für mich ausleihen" })).toBeVisible();

  await page.getByRole("button", { name: "Weiter scannen" }).click();
  await field.fill(barcode);
  await page.getByRole("button", { name: "Suchen", exact: true }).click();
  await expect(result).toContainText(`1 Treffer für ${barcode}`);
  await expect(result.getByTestId("item-row")).toContainText(name);

  await page.getByRole("button", { name: "Weiter scannen" }).click();
  await field.fill("9783161484101");
  await page.getByRole("button", { name: "Suchen", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Diese ISBN stimmt nicht");
});
