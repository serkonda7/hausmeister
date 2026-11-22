// Public server functions for the invite page (/invite/$token). These are the
// only data-touching functions without authMiddleware: the invitee has no
// account yet. Both are throttled per client IP, and every kind of invalid
// token (unknown, used, expired, revoked) gets the same answer.
import { createServerFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import { z } from "zod";
import { getDb } from "../db/client";
import { clientIp, createRateLimiter } from "../http/rate-limit";
import { getAuth, HttpError } from "./context";
import { acceptInvite, inviteStatus } from "./invites";

const lookups = createRateLimiter({ windowMs: 15 * 60_000, max: 30 });
const accepts = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });

function throttle(limiter: typeof lookups) {
  if (!limiter.hit(clientIp(getRequest().headers))) throw new HttpError(429, "RATE_LIMITED");
}

const token = z.string().min(1).max(200);

/** `{ role }` for a usable invite, otherwise null. */
export const getInvite = createServerFn({ method: "GET" })
  .validator(z.object({ token }))
  .handler(({ data }) => {
    throttle(lookups);
    return inviteStatus(getDb(), data.token);
  });

/**
 * Creates the account and signs the new user in (session cookie is set on
 * this response). Throws INVITE_INVALID, RATE_LIMITED or a UserInputError code.
 */
export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token,
      username: z.string().max(100),
      displayName: z.string().max(200),
      password: z.string().max(200),
    }),
  )
  .handler(async ({ data }) => {
    throttle(accepts);
    const user = await acceptInvite(getDb(), data);
    // tanstackStartCookies() forwards Better Auth's Set-Cookie to this response.
    await getAuth().api.signInUsername({
      body: { username: user.username, password: data.password },
      headers: getRequest().headers,
    });
    return { ok: true as const };
  });
