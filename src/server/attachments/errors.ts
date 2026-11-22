import type { AttachmentErrorCode } from "../../lib/attachments/rules";

/**
 * A rejected upload or attachment change. `message` is the code (the UI maps it
 * to German); `status` is what the HTTP route answers with.
 */
export class AttachmentError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415 | 422,
    public readonly code: AttachmentErrorCode,
  ) {
    super(code);
    this.name = "AttachmentError";
  }
}
