// The standalone CLI (scripts/create-admin-invite.ts) must stay compatible
// with the app's invite code: run it as a process against a real DB file.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openDatabase } from "../db/client";
import { events } from "../db/schema";
import { acceptInvite, inviteStatus } from "./invites";

const dir = mkdtempSync(join(tmpdir(), "hm-cli-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const script = resolve(import.meta.dir, "../../../scripts/create-admin-invite.ts");

function run(dbPath: string, ...args: string[]) {
  const p = Bun.spawnSync(["bun", script, ...args], {
    env: { ...process.env, DATABASE_PATH: dbPath, ORIGIN: "https://sub.example.de" },
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

describe("create-admin-invite CLI", () => {
  test("prints a working admin link; refuses without --force once an admin exists", async () => {
    const path = join(dir, "app.sqlite");
    const db = openDatabase(path);
    const r = run(path);
    expect(r.code).toBe(0);
    const url = r.out.match(/https:\/\/sub\.example\.de\/invite\/(\S+)/);
    expect(url).not.toBeNull();
    const token = url![1]!;
    expect(inviteStatus(db, token)).toEqual({ role: "admin" });
    const ev = db.select().from(events).all();
    expect(ev.map((e) => e.action)).toEqual(["invite.created"]);
    expect(JSON.stringify(ev[0]?.diff)).not.toContain(token);

    const admin = await acceptInvite(db, {
      token,
      username: "chef",
      displayName: "Chef",
      password: "chef-password-1",
    });
    expect(admin.role).toBe("admin");

    const refused = run(path);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("--force");
    const forced = run(path, "--force", "--role", "member", "--hours", "2");
    expect(forced.code).toBe(0);
    const t2 = forced.out.match(/\/invite\/(\S+)/)![1]!;
    expect(inviteStatus(db, t2)).toEqual({ role: "member" });
    db.$client.close();
  });

  test("fails cleanly without a database", () => {
    const r = run(join(dir, "missing.sqlite"));
    expect(r.code).toBe(1);
    expect(r.err).toContain("not found");
  });
});
