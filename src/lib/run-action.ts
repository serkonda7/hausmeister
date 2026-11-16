import { showToast } from "~/components/ui/toast";
import { errorText, goToLogin, isSignedOutError } from "./error-text";

/**
 * Runs a UI action (usually a server function call): toasts `success` when it
 * works, the mapped error text when it fails, and sends signed-out users
 * (e.g. just disabled) to /login. Returns the result, or undefined on error.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  opts: { success?: string | ((r: T) => string) } = {},
): Promise<T | undefined> {
  try {
    const r = await fn();
    const s = typeof opts.success === "function" ? opts.success(r) : opts.success;
    if (s) showToast({ title: s, variant: "success" });
    return r;
  } catch (err) {
    if (isSignedOutError(err)) {
      goToLogin();
      return undefined;
    }
    showToast({ title: errorText(err), variant: "error" });
    return undefined;
  }
}
