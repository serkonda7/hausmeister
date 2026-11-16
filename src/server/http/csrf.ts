// CSRF guard for every state-changing request (server functions, /api/auth,
// future /api/v1 routes). Browsers always send Origin on non-GET requests, so a
// mismatching Origin, or a cross-site Sec-Fetch-Site, is rejected. Requests
// without either header (scripts, curl) pass; they carry no ambient cookies.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSiteWrite(request: Request, origin: string): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const reqOrigin = request.headers.get("origin");
  if (reqOrigin && reqOrigin !== "null") return reqOrigin !== origin;
  if (reqOrigin === "null") return true;
  const site = request.headers.get("sec-fetch-site");
  return site === "cross-site" || site === "same-site";
}
