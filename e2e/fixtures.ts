// Reusable e2e fixtures. Import `test` and `expect` from here in every spec:
//
//   import { expect, test } from "./fixtures";
//   test("…", async ({ page, adminPage, newUser }) => { … });
//
// - `page` is a fresh, signed-out phone-sized page.
// - `adminPage` is a page signed in as the first admin (ADMIN in ./env.ts),
//   created once by bootstrap.setup.ts. Never sign it out or change the admin.
// - `newUser(role)` creates a fresh user through a real invite and returns a
//   signed-in page for them plus their credentials.
// - Every test gets its own X-Forwarded-For client IP, so per-IP rate limits
//   (sign-in, invite accept) never leak between tests.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  type Browser,
  type BrowserContext,
  test as base,
  expect,
  type Page,
} from "@playwright/test";
import { ADMIN_STATE, E2E_DB, E2E_ORIGIN } from "./env";

export { expect };
export type Role = "admin" | "member" | "guest";
export type TestUser = {
  username: string;
  password: string;
  displayName: string;
  role: Role;
  /** Signed in as this user (its own browser context). */
  page: Page;
};

let seq = 0;
/** A fresh valid username (≤ 30 chars, [a-z0-9_.]). */
export function uniqueName(prefix: string): string {
  seq++;
  return `${prefix}_${Date.now().toString(36)}${process.pid.toString(36)}${seq}`.slice(0, 30);
}

function fakeIp(seed: string): string {
  const h = createHash("sha256").update(seed).digest();
  return `100.${64 + (h[0]! % 64)}.${h[1]}.${1 + (h[2]! % 250)}`;
}

/** One-time invite link straight from the operator CLI (no UI needed). */
export function cliInvite(role: Role = "member"): string {
  const out = execFileSync(
    "bun",
    ["scripts/create-admin-invite.ts", "--force", "--role", role, "--hours", "1"],
    { env: { ...process.env, DATABASE_PATH: E2E_DB, ORIGIN: E2E_ORIGIN }, encoding: "utf8" },
  );
  const link = out.match(/(http\S+\/invite\/\S+)/)?.[1];
  if (!link) throw new Error(`no invite link in: ${out}`);
  return link;
}

/** Fills the invite form and waits for the home page. */
export async function acceptInvite(
  page: Page,
  link: string,
  u: { username: string; password: string; displayName: string },
) {
  await page.goto(link);
  await page.getByLabel("Anzeigename").fill(u.displayName);
  await page.getByLabel("Benutzername").fill(u.username);
  await page.getByLabel("Passwort", { exact: true }).fill(u.password);
  await page.getByLabel("Passwort wiederholen").fill(u.password);
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page).toHaveURL(`${E2E_ORIGIN}/`);
  await expect(page.getByRole("heading", { name: `Hallo ${u.displayName}` })).toBeVisible();
}

/** Signs in on /login with username and password (does not wait for the result). */
export async function submitLogin(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
}

export async function signIn(page: Page, username: string, password: string) {
  await submitLogin(page, username, password);
  await expect(page).toHaveURL(`${E2E_ORIGIN}/`);
}

/** Opens the user menu in the header and picks an entry. */
export async function userMenu(page: Page, entry: "Mein Konto" | "Abmelden") {
  await page.getByRole("banner").getByRole("button").last().click();
  await page.getByRole("menuitem", { name: entry }).click();
}

/**
 * CSP guard (DESIGN §8.4): every page of every test reports Content Security
 * Policy violations, from the `securitypolicyviolation` event and from console
 * errors; the test fails at teardown if there were any.
 */
const CSP_MARK = "[csp-violation]";
export function watchCsp(context: BrowserContext, violations: string[]) {
  void context.addInitScript((mark) => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(
        `${mark} ${e.violatedDirective} blocked ${e.blockedURI || "inline"} at ${e.sourceFile}:${e.lineNumber} ${e.sample}`,
      );
    });
  }, CSP_MARK);
  const onPage = (page: Page) =>
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes(CSP_MARK) || /Content Security Policy/i.test(text))
        violations.push(`${page.url()}: ${text}`);
    });
  context.pages().forEach(onPage);
  context.on("page", onPage);
}

async function newPage(browser: Browser, ip: string, violations: string[], storageState?: string) {
  const context = await browser.newContext({
    storageState,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  watchCsp(context, violations);
  return context.newPage();
}

type Fixtures = {
  clientIp: string;
  cspViolations: string[];
  adminPage: Page;
  newUser: (role?: Role, displayName?: string) => Promise<TestUser>;
};

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured first argument
  clientIp: async ({}, use, info) => use(fakeIp(`${info.testId}:${info.retry}`)),
  extraHTTPHeaders: async ({ clientIp }, use) => use({ "x-forwarded-for": clientIp }),
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured first argument
  cspViolations: async ({}, use) => {
    const violations: string[] = [];
    await use(violations);
    expect(violations, "Content Security Policy violations").toEqual([]);
  },
  context: async ({ context, cspViolations }, use) => {
    watchCsp(context, cspViolations);
    await use(context);
  },
  adminPage: async ({ browser, clientIp, cspViolations }, use) => {
    const page = await newPage(browser, clientIp, cspViolations, ADMIN_STATE);
    await use(page);
    await page.context().close();
  },
  newUser: async ({ browser, clientIp, cspViolations }, use) => {
    const pages: Page[] = [];
    await use(async (role = "member", displayName) => {
      const username = uniqueName(role);
      const u = {
        username,
        password: `pw-${username}-123`,
        displayName: displayName ?? `Test ${username.slice(-6)}`,
        role,
      };
      const page = await newPage(browser, clientIp, cspViolations);
      pages.push(page);
      await acceptInvite(page, cliInvite(role), u);
      return { ...u, page };
    });
    for (const p of pages) await p.context().close();
  },
});
