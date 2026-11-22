// Automated accessibility pass (axe, WCAG 2.x A/AA rules) over the main pages,
// plus a check that none of them scrolls sideways at phone width.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addItem, hydrated, token } from "./item-helpers";

async function audit(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = r.violations.map(
    (v) => `${path}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary).toEqual([]);
  // Phone layout: the page itself must never scroll sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
}

test("main pages have no axe violations", async ({ newUser }) => {
  const u = await newUser("member");
  const t = token();
  const id = await addItem(u.page, {
    type: "Kleidung",
    name: `Regenjacke ${t}`,
    more: (p) => p.getByLabel("Beschreibung").fill("Gelb"),
  });
  for (const path of [
    "/",
    "/items",
    `/items?q=${t}&view=list`,
    "/items/new",
    `/items/${id}`,
    `/items/${id}/edit`,
    "/locations",
    "/items/00000000-0000-7000-8000-000000000000",
  ])
    await audit(u.page, path);

  await u.page.goto("/locations");

  await hydrated(u.page);
  await u.page.getByLabel("Name", { exact: true }).fill(`Dachboden ${t}`);
  await u.page.getByRole("button", { name: "Anlegen" }).click();
  await u.page.getByRole("link", { name: new RegExp(`Dachboden ${t}`) }).click();
  await expect(u.page.getByRole("heading", { level: 1 })).toBeVisible();
  await audit(u.page, new URL(u.page.url()).pathname);
});

test("loans, scan, labels and inbox pages have no axe violations", async ({ newUser }) => {
  const u = await newUser("member");
  const id = await addItem(u.page, { type: "Werkzeug", name: `Leiter ${token()}` });
  await u.page.getByRole("button", { name: "Ausleihen", exact: true }).click();
  await u.page.getByRole("dialog").getByRole("button", { name: "Ausleihen", exact: true }).click();
  await expect(u.page.getByTestId("loan")).toBeVisible();
  for (const path of [
    `/items/${id}`,
    "/loans",
    "/contacts",
    "/notifications",
    "/scan",
    "/items/shelf",
    `/labels?item=${id}`,
    `/labels?item=${id}&format=thermal`,
    "/q/ZZZZZZ",
  ])
    await audit(u.page, path);
});
