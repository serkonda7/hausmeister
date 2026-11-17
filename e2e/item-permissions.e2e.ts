// Who sees what (DESIGN §3): money hiding, private items, guests and grants.
import { expect, test, uniqueName } from "./fixtures";
import { addItem, hydrated, ownMore, photoFile, results, searchItems, token } from "./item-helpers";

const NOT_FOUND = "Gegenstand nicht gefunden";

test("another member sees a household-visible item without price or receipt and cannot edit", async ({
  newUser,
}) => {
  const owner = await newUser("member");
  const other = await newUser("member");
  const t = token();
  const name = `Kamera ${t}`;
  const id = await addItem(owner.page, {
    type: "Elektronik",
    name,
    more: ownMore({ price: "499,90" }),
  });

  // The owner adds a receipt and sees price, receipt and the edit button.
  const files = owner.page.getByRole("region", { name: "Belege und Anleitungen" });
  await files.getByLabel("Hochladen als").selectOption("receipt");
  await files.getByTestId("attachment-file-input").setInputFiles(photoFile("kassenbon.png"));
  await expect(files.locator("[data-status=done]")).toHaveCount(1);
  await owner.page.reload();
  await hydrated(owner.page);
  await expect(owner.page.getByTestId("item-price")).toHaveText("499,90 €");
  await expect(files.getByText("kassenbon.png")).toBeVisible();
  await expect(owner.page.getByRole("link", { name: "Bearbeiten" })).toBeVisible();

  // The other member: view only.
  await other.page.goto(`/items/${id}`);
  await hydrated(other.page);
  await expect(other.page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(other.page.getByTestId("item-price")).toHaveCount(0);
  await expect(other.page.getByText("499,90")).toHaveCount(0);
  await expect(other.page.getByText("kassenbon.png")).toHaveCount(0);
  await expect(other.page.getByRole("heading", { name: "Belege" })).toHaveCount(0);
  await expect(other.page.getByRole("link", { name: "Bearbeiten" })).toHaveCount(0);
  await expect(other.page.getByRole("button", { name: "Umräumen" })).toHaveCount(0);
  await other.page.goto(`/items/${id}/edit`);
  await hydrated(other.page);
  await expect(other.page.getByRole("alert")).toHaveText("Dafür fehlt dir die Berechtigung.");

  // No price in the list either, and no price sort offered.
  await searchItems(other.page, t);
  await expect(results(other.page).getByText(name)).toBeVisible();
  await expect(results(other.page).getByText("€")).toHaveCount(0);
});

test("a private item is invisible to another member, by URL and in search, but not to an admin", async ({
  newUser,
  adminPage,
}) => {
  const owner = await newUser("member");
  const other = await newUser("member");
  const t = token();
  const name = `Tagebuch ${t}`;
  const id = await addItem(owner.page, {
    type: "Werkzeug",
    name,
    more: ownMore({ private: true }),
  });
  await expect(owner.page.getByTestId("item-visibility")).toHaveText(
    "Privat: sichtbar für dich, Admins und alle, mit denen du teilst.",
  );

  const res = await other.page.goto(`/items/${id}`);

  await hydrated(other.page);
  expect(res?.status()).toBe(404);
  await expect(other.page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  await searchItems(other.page, t);
  await expect(other.page.getByText("Nichts gefunden.")).toBeVisible();

  await adminPage.goto(`/items/${id}`);

  await hydrated(adminPage);
  await expect(adminPage.getByRole("heading", { level: 1, name })).toBeVisible();
  await searchItems(adminPage, t);
  await expect(results(adminPage).getByText(name)).toBeVisible();
});

test("a guest sees only what is shared with them, without price, and cannot add", async ({
  newUser,
}) => {
  const owner = await newUser("member");
  const guest = await newUser("guest");
  const t = token();
  const shared = `Bilderbuch ${t}`;
  await addItem(owner.page, {
    type: "Werkzeug",
    name: `Säge ${t}`,
    more: ownMore({ price: "20" }),
  });
  const id = await addItem(owner.page, {
    type: "Werkzeug",
    name: shared,
    more: ownMore({ price: "12,50" }),
  });

  const share = owner.page.getByRole("region", { name: "Teilen" });
  await share.getByLabel("Teilen mit").selectOption({ label: `${guest.displayName} (Gast)` });
  await expect(share.getByLabel("Recht", { exact: true }).locator("option")).toHaveText([
    "Ansehen",
    "Benutzen",
  ]);
  await share.getByLabel("Recht", { exact: true }).selectOption("use");
  await share.getByRole("button", { name: "Teilen", exact: true }).click();
  await expect(
    share.getByRole("list", { name: "Freigaben" }).getByText(guest.displayName),
  ).toBeVisible();

  const g = guest.page;
  await g.goto("/");
  await hydrated(g);
  await expect(g.getByRole("link", { name: /Schnell hinzufügen/ })).toHaveCount(0);
  await expect(g.getByRole("link", { name: "Verwaltung" })).toHaveCount(0);
  await searchItems(g, t);
  await expect(results(g).getByRole("link")).toHaveCount(1);
  await expect(results(g).getByText(shared)).toBeVisible();
  await expect(g.getByRole("link", { name: /Neu$/ })).toHaveCount(0);
  await g.goto(`/items/${id}`);
  await hydrated(g);
  await expect(g.getByRole("heading", { level: 1, name: shared })).toBeVisible();
  await expect(g.getByTestId("item-price")).toHaveCount(0);
  await expect(g.getByText("12,50")).toHaveCount(0);
  await expect(g.getByRole("button", { name: "Umräumen" })).toBeVisible(); // use
  await expect(g.getByRole("link", { name: "Bearbeiten" })).toHaveCount(0);
  await g.goto("/items/new");
  await expect(g.getByText("Seite nicht gefunden.")).toBeVisible();
});

test("share an item with a group, then revoke it", async ({ newUser, adminPage }) => {
  const owner = await newUser("member");
  const friend = await newUser("member");
  const group = `Freunde ${uniqueName("g").slice(-6)}`;
  await adminPage.goto("/admin/groups");
  await hydrated(adminPage);
  await adminPage.getByLabel("Name der neuen Gruppe").fill(group);
  await adminPage.getByRole("button", { name: "Gruppe anlegen" }).click();
  const card = adminPage.getByRole("listitem").filter({ hasText: group }).first();
  await card
    .getByLabel(`Person für ${group} wählen`)
    .selectOption({ label: `${friend.displayName} (@${friend.username})` });
  await card.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(card.getByText(friend.displayName)).toBeVisible();

  const t = token();
  const name = `Zelt ${t}`;
  const id = await addItem(owner.page, {
    type: "Werkzeug",
    name,
    more: ownMore({ private: true }),
  });
  await friend.page.goto(`/items/${id}`);
  await hydrated(friend.page);
  await expect(friend.page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();

  const share = owner.page.getByRole("region", { name: "Teilen" });
  await share.getByLabel("Teilen mit").selectOption({ label: `Gruppe ${group}` });
  await share.getByRole("button", { name: "Teilen", exact: true }).click();
  const row = share.getByRole("list", { name: "Freigaben" }).getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row.getByLabel(`Recht für ${group}`)).toHaveValue("view");

  await friend.page.reload();

  await hydrated(friend.page);
  await expect(friend.page.getByRole("heading", { level: 1, name })).toBeVisible();
  // The grant shows in the history of the manager.
  await owner.page.reload();
  await hydrated(owner.page);
  await expect(
    owner.page.getByRole("list", { name: "Verlauf" }).getByText(`für ${group}`),
  ).toBeVisible();

  await owner.page
    .getByRole("region", { name: "Teilen" })
    .getByRole("button", { name: `Freigabe für ${group} entfernen` })
    .click();
  await expect(owner.page.getByText("Mit niemandem extra geteilt.")).toBeVisible();
  await friend.page.reload();
  await hydrated(friend.page);
  await expect(friend.page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
});
