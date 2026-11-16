import { describe, expect, setSystemTime, test } from "bun:test";
import { SIGN_IN_LOCKED } from "./handler";
import { addTrustedUsername, LoginLockout, trustedUsernames } from "./lockout";
import {
  cookieHeader,
  createTestAuth,
  createTestUser,
  signInRequest,
  TEST_ORIGIN,
  TEST_PASSWORD,
  TEST_SECRET,
} from "./test-helpers";

const WRONG = "wrong-password-123";
const MIN = 60_000;

describe("LoginLockout", () => {
  test("locks after 5 failures; lock grows and expires; refused attempts do not extend it", () => {
    const l = new LoginLockout();
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) l.fail("anna", t + i);
    expect(l.check("anna", t + 4).locked).toBe(false);
    l.fail("anna", t + 5);
    expect(l.check("anna", t + 6)).toEqual({ locked: true, retryAfterMs: MIN - 1 });
    // Hammering during the lock changes nothing.
    for (let i = 0; i < 50; i++) l.fail("anna", t + 10 + i);
    expect(l.check("anna", t + 5 + MIN).locked).toBe(false);
    // Second lock is twice as long, capped at 15 minutes.
    let now = t + 5 + MIN;
    const lockLengths: number[] = [];
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < 5; i++) l.fail("anna", now);
      const s = l.check("anna", now);
      if (!s.locked) throw new Error("expected lock");
      lockLengths.push(s.retryAfterMs);
      now += s.retryAfterMs;
    }
    expect(lockLengths).toEqual([2, 4, 8, 15, 15, 15].map((x) => x * MIN));
    // A quiet hour resets the escalation.
    now += 61 * MIN;
    for (let i = 0; i < 5; i++) l.fail("anna", now);
    expect(l.check("anna", now)).toEqual({ locked: true, retryAfterMs: MIN });
  });

  test("failures outside the 15-minute window do not add up; success clears", () => {
    const l = new LoginLockout();
    for (let i = 0; i < 4; i++) l.fail("ben", i);
    l.fail("ben", 16 * MIN);
    expect(l.check("ben", 16 * MIN).locked).toBe(false);
    for (let i = 0; i < 3; i++) l.fail("ben", 16 * MIN + i);
    l.succeed("ben");
    l.fail("ben", 17 * MIN);
    expect(l.check("ben", 17 * MIN).locked).toBe(false);
  });

  test("device cookie entries verify only with the right secret and username", () => {
    let v = addTrustedUsername(undefined, TEST_SECRET, "anna");
    v = addTrustedUsername(v, TEST_SECRET, "ben");
    expect(trustedUsernames(v, TEST_SECRET).sort()).toEqual(["anna", "ben"]);
    expect(trustedUsernames(v, "another-secret-0123456789abcdefghij")).toEqual([]);
    const forged = v.replace(/^ben:/, "admin:");
    expect(trustedUsernames(forged, TEST_SECRET)).not.toContain("admin");
    expect(trustedUsernames("garbage,,a:b", TEST_SECRET)).toEqual([]);
  });
});

describe("sign-in handler with lockout", () => {
  async function setup() {
    const t = createTestAuth();
    await createTestUser(t.db, "anna", "admin");
    return t;
  }
  const fail5 = async (h: Parameters<typeof signInRequest>[0], u: string, headers = {}) => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++)
      statuses.push((await signInRequest(h, u, WRONG, TEST_ORIGIN, headers)).status);
    return statuses;
  };

  test("an existing and an unknown username behave identically", async () => {
    const { handler } = await setup();
    const known = await fail5(handler, "anna");
    const unknown = await fail5(handler, "nobody");
    expect(known).toEqual([401, 401, 401, 401, 401]);
    expect(unknown).toEqual(known);
    const a = await signInRequest(handler, "anna", TEST_PASSWORD);
    const b = await signInRequest(handler, "nobody", TEST_PASSWORD);
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(ja).toEqual(jb);
    expect(ja).toEqual({ code: SIGN_IN_LOCKED, message: "Too many attempts" });
    expect(a.headers.get("retry-after")).toBe(b.headers.get("retry-after"));
    // Case and whitespace do not give a fresh counter.
    expect((await signInRequest(handler, " ANNA ", TEST_PASSWORD)).status).toBe(429);
  });

  test("the lock applies across client IPs and expires", async () => {
    const { handler } = await setup();
    await fail5(handler, "anna", { "x-forwarded-for": "100.64.0.1" });
    const other = await signInRequest(handler, "anna", TEST_PASSWORD, TEST_ORIGIN, {
      "x-forwarded-for": "100.64.0.2",
    });
    expect(other.status).toBe(429);
    setSystemTime(new Date(Date.now() + MIN + 1000));
    try {
      expect((await signInRequest(handler, "anna", TEST_PASSWORD)).status).toBe(200);
    } finally {
      setSystemTime();
    }
  });

  test("a device that signed in before is not locked out by an attacker", async () => {
    const { handler, db } = await setup();
    await createTestUser(db, "ben");
    const ok = await signInRequest(handler, "anna");
    expect(ok.status).toBe(200);
    const device = cookieHeader(ok)
      .split("; ")
      .find((c) => c.startsWith("hm.device="))!;
    expect(device).toBeDefined();

    // Attacker (no device cookie) locks the public bucket and keeps hammering.
    await fail5(handler, "anna");
    await fail5(handler, "anna");
    expect((await signInRequest(handler, "anna")).status).toBe(429);

    // The owner's device still gets in.
    const mine = await signInRequest(handler, "anna", TEST_PASSWORD, TEST_ORIGIN, {
      cookie: device,
    });
    expect(mine.status).toBe(200);
    // A device cookie for anna does not help with another username.
    await fail5(handler, "ben");
    const ben = await signInRequest(handler, "ben", TEST_PASSWORD, TEST_ORIGIN, { cookie: device });
    expect(ben.status).toBe(429);
  });

  test("non-JSON sign-in bodies are refused instead of bypassing the lockout", async () => {
    const { handler } = await setup();
    const res = await handler(
      new Request(`${TEST_ORIGIN}/api/auth/sign-in/username`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: TEST_ORIGIN },
        body: `username=anna&password=${TEST_PASSWORD}`,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("username enumeration endpoint is disabled", async () => {
    const { handler } = await setup();
    const res = await handler(
      new Request(`${TEST_ORIGIN}/api/auth/is-username-available`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ username: "anna" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
