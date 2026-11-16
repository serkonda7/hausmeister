import { acceptInvite, expect, signIn, submitLogin, test, uniqueName, userMenu } from "./fixtures";

test("admin invites a member, who accepts and sees no admin sections", async ({
  adminPage,
  page,
}) => {
  await adminPage.goto("/admin/invites");
  await adminPage.getByLabel("Rolle").selectOption("member");
  await adminPage.getByRole("button", { name: "Einladung erstellen" }).click();
  const link = await adminPage.getByLabel("Einladungslink").inputValue();
  expect(link).toMatch(/\/invite\/[\w-]{43}$/);
  await expect(adminPage.getByText("nur jetzt angezeigt")).toBeVisible();
  await expect(
    adminPage.getByRole("list", { name: "Offene Einladungen" }).getByText("Mitglied"),
  ).not.toHaveCount(0);

  const username = uniqueName("lena");
  await acceptInvite(page, link, { username, password: "lenas-password-1", displayName: "Lena" });
  await expect(page.getByText("Rolle: Mitglied")).toBeVisible();

  // Members may open the admin area, but only "Typen" is offered …
  await page.goto("/admin/users");
  await expect(page.getByText("Seite nicht gefunden.")).toBeVisible();
  for (const path of ["/admin/invites", "/admin/groups", "/admin/settings"]) {
    await page.goto(path);
    await expect(page.getByText("Seite nicht gefunden.")).toBeVisible();
  }
  await page.goto("/");
  await page.getByRole("link", { name: "Verwaltung" }).click();
  const sections = page.getByRole("navigation", { name: "Bereiche der Verwaltung" });
  await expect(sections.getByRole("link")).toHaveText(["Typen"]);

  // … and the used link is gone from the admin's pending list.
  await adminPage.reload();
  await expect(adminPage.getByLabel("Einladungslink")).toHaveCount(0);
});

test("a guest cannot open the admin area", async ({ newUser }) => {
  const guest = await newUser("guest");
  await expect(guest.page.getByRole("link", { name: "Verwaltung" })).toHaveCount(0);
  await guest.page.goto("/admin");
  await expect(guest.page.getByText("Seite nicht gefunden.")).toBeVisible();
});

test("sign out and sign in again with the password", async ({ newUser }) => {
  const u = await newUser("member");
  await userMenu(u.page, "Abmelden");
  await expect(u.page).toHaveURL(/\/login/);
  await u.page.goto("/");
  await expect(u.page).toHaveURL(/\/login/);
  await signIn(u.page, u.username, u.password);
  await expect(u.page.getByRole("heading", { name: `Hallo ${u.displayName}` })).toBeVisible();
});

test("a wrong password shows the German error", async ({ newUser, page }) => {
  const u = await newUser("member");
  await submitLogin(page, u.username, "definitely-wrong-pw");
  await expect(page.getByRole("alert")).toHaveText(
    "Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.",
  );
  await expect(page).toHaveURL(/\/login/);
  // An unknown username gets exactly the same message.
  await submitLogin(page, "nobody_here", "definitely-wrong-pw");
  await expect(page.getByRole("alert")).toHaveText(
    "Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.",
  );
});

test("register a passkey and sign in with it (virtual authenticator)", async ({ newUser }) => {
  const u = await newUser("member");
  const cdp = await u.page.context().newCDPSession(u.page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await userMenu(u.page, "Mein Konto");
  await expect(u.page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();
  await expect(u.page.getByText("Noch keine Passkeys.")).toBeVisible();
  await u.page.getByLabel("Name des Passkeys").fill("Testhandy");
  await u.page.getByRole("button", { name: "Passkey hinzufügen" }).click();
  const list = u.page.getByRole("list", { name: "Passkeys" });
  await expect(list.getByText("Testhandy")).toBeVisible();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(1);

  // Rename it.
  await list.getByRole("button", { name: "Umbenennen" }).click();
  await list.getByLabel("Name des Passkeys").fill("Arbeitshandy");
  await list.getByRole("button", { name: "Speichern" }).click();
  await expect(list.getByText("Arbeitshandy")).toBeVisible();

  // Sign out, then sign in with the passkey only.
  await u.page.getByRole("button", { name: "Abmelden" }).click();
  await expect(u.page).toHaveURL(/\/login/);
  await u.page.getByRole("button", { name: "Mit Passkey anmelden" }).click();
  await expect(u.page.getByRole("heading", { name: `Hallo ${u.displayName}` })).toBeVisible();

  // Delete it again.
  await u.page.goto("/account");
  await list.getByRole("button", { name: "Löschen" }).click();
  await u.page.getByRole("alertdialog").getByRole("button", { name: "Löschen" }).click();
  await expect(u.page.getByText("Noch keine Passkeys.")).toBeVisible();
});

test("a disabled user is thrown out and cannot sign in", async ({ adminPage, newUser }) => {
  const u = await newUser("member", `Ben ${uniqueName("b").slice(-5)}`);
  await adminPage.goto("/admin/users");
  const card = adminPage.getByRole("listitem").filter({ hasText: `@${u.username}` });
  await card.getByRole("button", { name: "Deaktivieren" }).click();
  await adminPage.getByRole("alertdialog").getByRole("button", { name: "Deaktivieren" }).click();
  await expect(card.getByText("Deaktiviert")).toBeVisible();

  // Next client-side navigation that talks to the server lands on /login.
  await userMenu(u.page, "Mein Konto");
  await expect(u.page).toHaveURL(/\/login/);
  await u.page.goto("/");
  await expect(u.page).toHaveURL(/\/login/);
  await submitLogin(u.page, u.username, u.password);
  await expect(u.page.getByRole("alert")).toHaveText("Dieses Konto ist deaktiviert.");

  // Enabling lets them back in.
  await card.getByRole("button", { name: "Aktivieren" }).click();
  await expect(card.getByText("Aktiv", { exact: true })).toBeVisible();
  await signIn(u.page, u.username, u.password);
});

test("admin manages groups and sets a password", async ({ adminPage, newUser }) => {
  const u = await newUser("member");
  const name = `Garage ${uniqueName("g").slice(-6)}`;
  await adminPage.goto("/admin/groups");
  await adminPage.getByLabel("Name der neuen Gruppe").fill(name);
  await adminPage.getByRole("button", { name: "Gruppe anlegen" }).click();
  const group = adminPage.getByRole("listitem").filter({ hasText: name }).first();
  await group
    .getByLabel(`Person für ${name} wählen`)
    .selectOption({ label: `${u.displayName} (@${u.username})` });
  await group.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(group.getByText(u.displayName)).toBeVisible();

  // The member sees the group on the home page.
  await u.page.reload();
  await expect(u.page.getByText(`Gruppen: ${name}`)).toBeVisible();

  await group.getByRole("button", { name: `${u.displayName} aus ${name} entfernen` }).click();
  await expect(group.getByText("Noch keine Mitglieder.")).toBeVisible();
  await group.getByRole("button", { name: "Löschen" }).click();
  await adminPage.getByRole("alertdialog").getByRole("button", { name: "Löschen" }).click();
  await expect(adminPage.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);

  // Admin resets the member's password: their session ends, the new one works.
  await adminPage.goto("/admin/users");
  const card = adminPage.getByRole("listitem").filter({ hasText: `@${u.username}` });
  await card.getByRole("button", { name: "Passwort setzen" }).click();
  await adminPage.getByRole("textbox", { name: "Neues Passwort" }).fill("set-by-admin-123");
  await adminPage.getByRole("dialog").getByRole("button", { name: "Passwort setzen" }).click();
  await expect(adminPage.getByText("muss sich neu anmelden")).toBeVisible();
  await u.page.goto("/");
  await expect(u.page).toHaveURL(/\/login/);
  await signIn(u.page, u.username, "set-by-admin-123");
});
