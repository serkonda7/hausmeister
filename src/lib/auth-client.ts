// Browser-side Better Auth client (same origin, /api/auth).
import { passkeyClient } from "@better-auth/passkey/client";
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/solid";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [usernameClient(), passkeyClient()],
});
