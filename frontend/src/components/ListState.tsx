import type { JSX } from 'solid-js'
import { Show } from 'solid-js'
import { t } from '../lib/i18n'

type ErrorValue = string | Error | { message?: unknown } | null | undefined | false

interface ListStateProps {
	loading?: boolean
	error?: ErrorValue
}

function errorMessage(error: ErrorValue): string | null {
	if (!error) {
		return null
	}
	if (typeof error === 'string') {
		return error || null
	}
	if (error instanceof Error) {
		return error.message || null
	}
	if (typeof error === 'object' && typeof error.message === 'string') {
		return error.message || null
	}
	return String(error)
}

/**
 * Shared loading / error triad:
 * `<p class="muted">Loading…</p>` + `<p class="form-error">…</p>`.
 * Plain-string errors render as-is; `Error` values get the
 * `Error: message` prefix (matching the previous per-page markup).
 */
export default function ListState(props: ListStateProps): JSX.Element {
	const message = () => errorMessage(props.error)
	const isPrefixed = () => props.error instanceof Error
	return (
		<>
			<Show when={props.loading}>
				<p class="muted">{t().common.loading}</p>
			</Show>
			<Show when={message()}>
				<p class="form-error">
					<Show when={isPrefixed()} fallback={message()}>
						{t().common.error}: {message()}
					</Show>
				</p>
			</Show>
		</>
	)
}
