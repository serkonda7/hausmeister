// Slow link: the server-rendered page is usable to look at before its
// JavaScript arrives. Scripts are held back (and the network throttled), the
// user types and taps early, then the scripts are released. Nothing typed may
// be lost and no early tap may submit a form natively (src/lib/hydrated.ts).
import type { Page } from "@playwright/test";
import { ADMIN } from "./env";
import { expect, test } from "./fixtures";
import { hydrated } from "./item-helpers";

/** Holds every script request until the returned release() is called; throttles the rest. */
async function slowLink(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  // About a weak 3G link over the VPN.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 300,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
  });
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route(/\/assets\/.*\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  return {
    release: async () => {
      release();
      await hydrated(page);
    },
  };
}

test("login: typing before hydration is kept, an early submit does nothing", async ({ page }) => {
  const net = await slowLink(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const submit = page.getByRole("button", { name: /Anmelden|Lädt/ }).first();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText("Lädt …");
  await page.getByLabel("Benutzername").fill(ADMIN.username);
  await page.getByLabel("Passwort").fill(ADMIN.password);
  await page.getByLabel("Passwort").press("Enter"); // implicit submission: blocked
  await submit.click({ force: true }); // a tap on the disabled button: nothing
  await expect(page).toHaveURL(/\/login$/);
  await net.release();
  await expect(page.getByLabel("Benutzername")).toHaveValue(ADMIN.username);
  await expect(page.getByLabel("Passwort")).toHaveValue(ADMIN.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: `Hallo ${ADMIN.displayName}` })).toBeVisible();
});

test("invite: the form keeps early input and only submits once ready", async ({ page }) => {
  const { cliInvite } = await import("./fixtures");
  const link = cliInvite("member");
  const net = await slowLink(page);
  await page.goto(link, { waitUntil: "domcontentloaded" });
  const submit = page.getByRole("button", { name: /Konto anlegen|Lädt/ });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Anzeigename").fill("Langsam");
  await page.getByLabel("Benutzername").fill(`slow_${Date.now().toString(36)}`);
  await page.getByLabel("Passwort", { exact: true }).fill("slow-password-123");
  await page.getByLabel("Passwort wiederholen").fill("slow-password-123");
  await page.getByLabel("Passwort wiederholen").press("Enter");
  await expect(page).toHaveURL(link);
  await net.release();
  await expect(page.getByLabel("Anzeigename")).toHaveValue("Langsam");
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Hallo Langsam" })).toBeVisible();
});

test("items list: a search typed before hydration is applied afterwards", async ({ adminPage }) => {
  const net = await slowLink(adminPage);
  await adminPage.goto("/items", { waitUntil: "domcontentloaded" });
  const box = adminPage.getByRole("searchbox", { name: "Gegenstände durchsuchen" });
  await box.fill("bohrmaschine");
  await box.press("Enter");
  await expect(adminPage).toHaveURL(/\/items$/);
  await net.release();
  await expect(box).toHaveValue("bohrmaschine");
  await expect(adminPage).toHaveURL(/[?&]q=bohrmaschine/);
});

test("quick add: inert with a loading state until hydrated, then usable", async ({ adminPage }) => {
  const net = await slowLink(adminPage);
  await adminPage.goto("/items/new", { waitUntil: "domcontentloaded" });
  const name = adminPage.getByRole("textbox", { name: /^Name/ });
  await expect(name).toBeDisabled();
  await expect(adminPage.getByRole("button", { name: "Lädt …" })).toBeDisabled();
  await net.release();
  await expect(name).toBeEnabled();
  await name.fill("Nach dem Laden");
  await expect(name).toHaveValue("Nach dem Laden");
  await expect(adminPage.getByRole("button", { name: "Speichern" })).toBeEnabled();
});

test("home search works before hydration as a plain GET form", async ({ adminPage }) => {
  await slowLink(adminPage); // scripts never arrive in this test
  await adminPage.goto("/", { waitUntil: "domcontentloaded" });
  const box = adminPage.getByLabel("Was suchst du?");
  await box.fill("hammer");
  await box.press("Enter");
  await expect(adminPage).toHaveURL(/\/items\?q=hammer$/);
});
