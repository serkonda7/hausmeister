// The authorization context every server function and route works with.
// Built per request by getAuthCtx() (src/server/auth/session.ts).
export type Role = "admin" | "member" | "guest";
export type AuthCtx = { userId: string; role: Role; groupIds: Set<string> };
