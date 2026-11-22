// Runs first (project "setup"): the first admin accepts the invite link the
// server printed at startup. Saves the admin session for `adminPage`.
import { readFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { ADMIN, ADMIN_STATE, BOOTSTRAP_LINK_FILE } from "./env";
import { acceptInvite } from "./fixtures";

setup("bootstrap invite → accept → home", async ({ page, browser }) => {
  const link = readFileSync(BOOTSTRAP_LINK_FILE, "utf8").trim();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Einladung annehmen" })).toBeVisible();
  await expect(page.getByText("als Administrator zu Hausmeister eingeladen")).toBeVisible();
  await acceptInvite(page, link, ADMIN);
  await expect(page.getByText("Rolle: Administrator")).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });

  // The link is single-use: a second visitor gets the friendly message.
  const other = await browser.newPage();
  await other.goto(link);
  await expect(other.getByRole("heading", { name: "Einladung nicht gültig" })).toBeVisible();
  await expect(other.getByText("ungültig, abgelaufen oder wurde schon benutzt")).toBeVisible();
  await other.close();
});
