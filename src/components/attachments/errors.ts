// German text for attachment error codes (HTTP `{ error }` bodies and
// server-function error messages). Falls back to the app-wide mapping.
import type { AttachmentErrorCode } from '~/lib/attachments/rules'
import { errorCode, errorText } from '~/lib/error-text'
import { m } from '~/paraglide/messages'

const TEXT: Record<
	AttachmentErrorCode | 'NOT_FOUND' | 'FORBIDDEN' | 'NETWORK' | 'SERVER',
	() => string
> = {
	ATTACHMENTS_TOO_LARGE: m.attachments_error_too_large,
	ATTACHMENTS_EMPTY: m.attachments_error_empty,
	ATTACHMENTS_TYPE_REJECTED: m.attachments_error_type,
	ATTACHMENTS_HEIC_UNSUPPORTED: m.attachments_error_heic,
	ATTACHMENTS_IMAGE_TOO_LARGE: m.attachments_error_image_too_large,
	ATTACHMENTS_IMAGE_INVALID: m.attachments_error_image_invalid,
	ATTACHMENTS_KIND_MISMATCH: m.attachments_error_kind_mismatch,
	ATTACHMENTS_BAD_REQUEST: m.attachments_error_bad_request,
	ATTACHMENTS_ORDER_INVALID: m.attachments_error_order,
	ATTACHMENTS_NOT_PHOTO: m.attachments_error_not_photo,
	NOT_FOUND: m.attachments_error_not_found,
	FORBIDDEN: m.attachments_error_forbidden,
	NETWORK: m.attachments_error_network,
	SERVER: m.attachments_error_server,
}

/** Text for a code ("ATTACHMENTS_…", "NOT_FOUND", …) or an Error whose message is one. */
export function attachmentErrorText(err: unknown): string {
	const code = typeof err === 'string' ? err : errorCode(err)
	return (code && TEXT[code as keyof typeof TEXT]?.()) || errorText(err)
}
