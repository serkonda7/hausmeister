import { attachmentErrorText } from "~/components/attachments/errors";
import { showToast } from "~/components/ui/toast";
import { errorCode, errorText, goToLogin, isSignedOutError } from "./error-text";
import { itemsErrorText, parseItemsError } from "./items/errors";

/**
 * German text for any error a server function or upload can throw: item,
 * location, tag, search and history codes (src/lib/items/errors.ts),
 * attachment codes (ATTACHMENTS_*), then the app-wide codes (error-text.ts).
 */
export function actionErrorText(err: unknown): string {
  if (parseItemsError(err).code) return itemsErrorText(err);
  if (errorCode(err)?.startsWith("ATTACHMENTS_")) return attachmentErrorText(err);
  return errorText(err);
}

/**
 * Runs a UI action (usually a server function call): toasts `success` when it
 * works, the mapped error text when it fails, and sends signed-out users
 * (e.g. just disabled) to /login. Returns the result, or undefined on error.
 * `onError` sees the raw error first (e.g. for VERSION_CONFLICT handling);
 * return true from it to skip the toast.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  opts: {
    success?: string | ((r: T) => string);
    onError?: (err: unknown) => boolean | undefined;
  } = {},
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
    if (opts.onError?.(err) === true) return undefined;
    showToast({ title: actionErrorText(err), variant: "error" });
    return undefined;
  }
}
