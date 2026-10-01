import { IconX } from '@tabler/icons-solidjs'
import { type JSX, onCleanup, onMount, Show } from 'solid-js'
import { t } from '../i18n'

export type DialogProps = {
	id: string
	title: string
	hint?: string
	/** Closable dialogs get a ✕ button and close on Escape. */
	onClose?: () => void
	closeLabel?: string
	/** Backdrop clicks ask before discarding unsaved changes. */
	isDirty?: () => boolean
	children: JSX.Element
}

export function Dialog(props: DialogProps) {
	onMount(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') props.onClose?.()
		}
		document.addEventListener('keydown', onKeyDown)
		onCleanup(() => document.removeEventListener('keydown', onKeyDown))
	})

	function onBackdropClick(e: MouseEvent): void {
		if (e.target !== e.currentTarget || !props.onClose) return
		if (props.isDirty?.() && !window.confirm(t('common.discardChanges'))) return
		props.onClose()
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dialog backdrop dismisses on mouse click; keyboard users have Cancel and Escape.
		<div class="dialog-backdrop" role="presentation" onClick={onBackdropClick}>
			<section
				class="dialog panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${props.id}-heading`}
			>
				<div class="dialog-heading">
					<h2 id={`${props.id}-heading`}>{props.title}</h2>
					<Show when={props.onClose}>
						<button
							type="button"
							class="clear"
							onClick={() => props.onClose?.()}
							aria-label={props.closeLabel}
						>
							<IconX size={18} />
						</button>
					</Show>
				</div>
				<Show when={props.hint}>
					<p class="hint">{props.hint}</p>
				</Show>
				{props.children}
			</section>
		</div>
	)
}
