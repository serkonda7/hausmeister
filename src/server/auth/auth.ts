// Better Auth configuration (DESIGN §7, §8.4).
//  - username + password, no email; public sign-up is impossible
//    (emailAndPassword.disableSignUp + /sign-up/* disabled). Accounts are
//    created only server-side via createUserWithPassword() (invite flow, T2).
//  - passkeys with RP ID = hostname of ORIGIN; registration needs a session.
//  - production (https ORIGIN): host-only `__Host-` cookies, Secure, Path=/, SameSite=Lax.
//  - disabled users: session creation is refused (covers password and passkey).
//  - per-username lockout wraps the HTTP handler (./handler.ts, ./lockout.ts).
import { passkey } from "@better-auth/passkey";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins/username";
import { tanstackStartCookies } from "better-auth/tanstack-start/solid";
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import type { Env } from "../env";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
/** Error code returned when a disabled user tries to sign in. */
export const ACCOUNT_DISABLED = "ACCOUNT_DISABLED";

export type CreateAuthOptions = {
  db: AppDb;
  env: Pick<Env, "ORIGIN" | "BETTER_AUTH_SECRET">;
  /** Forward Set-Cookie from `auth.api.*` calls inside TanStack Start requests. Off in unit tests. */
  startCookies?: boolean;
  /** Defaults to on. */
  rateLimit?: boolean;
};

export function createAuth({ db, env, startCookies = true, rateLimit = true }: CreateAuthOptions) {
  const origin = new URL(env.ORIGIN);
  const https = origin.protocol === "https:";
  return betterAuth({
    appName: "Hausmeister",
    baseURL: origin.origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin.origin],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, { provider: "sqlite", schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    // /is-username-available would reveal which usernames exist; there is no
    // email, so password-reset-by-mail is off too (an admin resets passwords).
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email",
      "/is-username-available",
      "/request-password-reset",
      "/reset-password",
    ],
    user: {
      fields: { name: "displayName", email: "authEmail" },
      additionalFields: {
        role: { type: "string", required: false, input: false, defaultValue: "member" },
        locale: { type: "string", required: false, input: false, defaultValue: "de-DE" },
        disabledAt: { type: "date", required: false, input: false },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh daily
    },
    rateLimit: {
      enabled: rateLimit,
      storage: "memory",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/username": { window: 60, max: 5 },
        "/passkey/verify-authentication": { window: 60, max: 10 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      // No automatic `__Secure-` prefix; we set `__Host-` ourselves (needs Secure, Path=/, no Domain).
      useSecureCookies: false,
      cookiePrefix: https ? "__Host-hm" : "hm",
      defaultCookieAttributes: { secure: https, path: "/", sameSite: "lax", httpOnly: true },
      crossSubDomainCookies: { enabled: false },
      // Caddy is the only client of the app and sets X-Forwarded-For.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      database: { generateId: () => Bun.randomUUIDv7() },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = db
              .select({ disabledAt: schema.users.disabledAt })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId))
              .get();
            if (!user || user.disabledAt) {
              throw new APIError("FORBIDDEN", {
                code: ACCOUNT_DISABLED,
                message: "Account is disabled",
              });
            }
          },
        },
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (u) => USERNAME_PATTERN.test(u.toLowerCase()),
      }),
      passkey({
        rpID: origin.hostname,
        rpName: "Hausmeister",
        origin: origin.origin,
      }),
      // Must be last (Better Auth warns otherwise).
      ...(startCookies ? [tanstackStartCookies()] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
