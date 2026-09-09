import { type JSX, Show } from 'solid-js'
import { t } from '../lib/i18n'
import './EmptyState.css'

interface EmptyStateProps {
	children: JSX.Element
	/** Optional illustration shown above the message. */
	icon?: JSX.Element
	/** Optional CTA button label (e.g. "Pool erstellen →"). Rendered only together with `onAction`. */
	actionLabel?: string
	/** CTA handler (e.g. open the create form). */
	onAction?: () => void
}

/**
 * Illustrated empty-state card with an optional CTA button.
 * Backwards-compatible: `<EmptyState>message</EmptyState>` still renders
 * the message without a button.
 */
export default function EmptyState(props: EmptyStateProps): JSX.Element {
	return (
		<div class="empty-state" role="status">
			<div class="empty-state-icon" aria-hidden="true">
				{props.icon ?? (
					<svg
						width="36"
						height="36"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						role="img"
					>
						<title>{t().emptyState.title}</title>
						<path d="M22 12h-5l-2 3h-6l-2-3H2" />
						<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
					</svg>
				)}
			</div>
			<p class="empty-state-text">{props.children}</p>
			<Show when={props.actionLabel && props.onAction}>
				<button
					type="button"
					class="btn-primary empty-state-cta"
					onClick={() => props.onAction?.()}
				>
					{props.actionLabel}
				</button>
			</Show>
		</div>
	)
}
