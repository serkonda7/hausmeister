import { showToast } from "~/components/ui/toast";
import { goToLogin, isSignedOutError } from "~/lib/error-text";
import { attachmentErrorText } from "./errors";

/** Like runAction (src/lib/run-action.ts), with the attachment error texts. */
export async function runAttachmentAction<T>(
  fn: () => Promise<T>,
  success?: string,
): Promise<T | undefined> {
  try {
    const r = await fn();
    if (success) showToast({ title: success, variant: "success" });
    return r;
  } catch (err) {
    if (isSignedOutError(err)) {
      goToLogin();
      return undefined;
    }
    showToast({ title: attachmentErrorText(err), variant: "error" });
    return undefined;
  }
}
