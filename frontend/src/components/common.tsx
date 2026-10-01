import { IconLoader2 } from '@tabler/icons-solidjs'
import { type JSX, Show, splitProps } from 'solid-js'
import { t } from '../i18n'
import { ClearableInput } from './ClearableInput'

export function ErrorText(props: { message: string | null | undefined }) {
	return (
		<Show when={props.message}>
			<p class="error">{props.message}</p>
		</Show>
	)
}

/** Muted em dash for empty table cells. */
export function Dash() {
	return <span class="muted">—</span>
}

export function orDash(value: JSX.Element): JSX.Element {
	return value === null || value === undefined || value === '' || value === false ? <Dash /> : value
}

export function LoadingRows(props: { count?: number }) {
	return (
		<div class="table-wrap">
			{Array.from({ length: props.count ?? 3 }, () => (
				<div class="skeleton skeleton-row" />
			))}
		</div>
	)
}

export function LoadError() {
	return (
		<div class="empty">
			<p>{t('library.loadError')}</p>
			<button type="button" class="ghost" onClick={() => window.location.reload()}>
				{t('library.reload')}
			</button>
		</div>
	)
}

export function SearchSummary(props: { query: string }) {
	return (
		<Show when={props.query}>
			<p class="muted">
				{t('library.resultsFor')} “<strong>{props.query}</strong>”
			</p>
		</Show>
	)
}

export type TextFieldProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'onInput'> & {
	id: string
	label: string
	value: string
	onInput: (value: string) => void
	labelClass?: string
}

/** Labelled, clearable text input; required fields get a `*` marker. */
export function TextField(props: TextFieldProps) {
	const [local, input] = splitProps(props, ['label', 'labelClass', 'onInput'])
	return (
		<label class={local.labelClass} for={input.id}>
			<span>
				{local.label}
				<Show when={input.required}>
					{' '}
					<em>*</em>
				</Show>
			</span>
			<ClearableInput {...input} onInput={(e) => local.onInput(e.currentTarget.value)} />
		</label>
	)
}

/** Primary submit button that shows a spinner and `busyLabel` while busy. */
export function SubmitButton(props: {
	busy: boolean
	busyLabel: string
	icon?: JSX.Element
	children: JSX.Element
}) {
	return (
		<button type="submit" class="primary" disabled={props.busy}>
			<Show when={props.icon}>
				<Show when={props.busy} fallback={props.icon}>
					<IconLoader2 size={16} class="spin" />
				</Show>
			</Show>
			{props.busy ? props.busyLabel : props.children}
		</button>
	)
}
