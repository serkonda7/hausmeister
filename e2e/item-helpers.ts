// Helpers for the item, location and search specs. Everything goes through the
// UI the family uses (no back doors), on the phone viewport.
import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

/** A tiny valid PNG (8×8, red), enough for the server's image pipeline. */
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC",
  "base64",
);
export const photoFile = (name = "foto.png") => ({ name, mimeType: "image/png", buffer: PNG });

/** A short unique token (≥ 3 chars, letters and digits) for names and searches. */
export function token(): string {
  return `x${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, "0")}`;
}

export type NewItem = {
  type: string;
  name: string;
  photo?: boolean;
  /** Fill optional fields after "Weitere Angaben" is open. */
  more?: (page: Page) => Promise<void>;
};

/** Quick add through /items/new; returns the new item's id (page ends on its detail page). */
export async function addItem(page: Page, item: NewItem): Promise<string> {
  await page.goto("/items/new");
  await hydrated(page);
  // The radio itself is visually hidden inside its card; tap the card like a user.
  const radio = page.getByRole("radio", { name: item.type, exact: true });
  await page.locator("label", { has: radio }).click();
  await expect(radio).toBeChecked();
  if (item.photo) await page.getByTestId("photo-input").setInputFiles(photoFile());
  await page.getByRole("textbox", { name: /^Name/ }).fill(item.name);
  if (item.more) {
    await page.getByText("Weitere Angaben (optional)").click();
    await item.more(page);
  }
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: item.name })).toBeVisible();
  return page.url().split("/").pop() as string;
}

/** Owner "Ich", optional private visibility and price, in "Weitere Angaben". */
export function ownMore(opts: { private?: boolean; price?: string } = {}) {
  return async (page: Page) => {
    const owner = page.getByLabel("Besitzer", { exact: true });
    await owner.selectOption({
      label: (await owner.locator("option", { hasText: "Ich (" }).textContent())!,
    });
    if (opts.private) await page.getByRole("radio", { name: /^Privat/ }).check();
    if (opts.price) await page.getByLabel("Preis (EUR)").fill(opts.price);
  };
}

/** Waits until the app has hydrated (input before that is lost). */
export const hydrated = (page: Page) =>
  page.locator("html[data-hydrated]").waitFor({ state: "attached" });

/** Types into the list's search box and waits for the URL to carry it. */
export async function searchItems(page: Page, q: string) {
  await page.goto("/items");
  await hydrated(page);
  await page.getByRole("searchbox", { name: "Gegenstände durchsuchen" }).fill(q);
  await page.getByRole("button", { name: "Suchen", exact: true }).click();
  await expect(page).toHaveURL(/[?&]q=/);
}

export const results = (page: Page) => page.getByTestId("item-results");

/** Selects the option whose text matches (options carry counts and indentation). */
export async function selectByText(select: Locator, text: RegExp) {
  const value = await select
    .locator("option")
    .filter({ hasText: text })
    .first()
    .getAttribute("value");
  await select.selectOption(value ?? "");
}
