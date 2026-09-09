import { type Accessor, createSignal, type Setter } from 'solid-js'

export interface CrudFormState<TForm extends object, E> {
	showForm: Accessor<boolean>
	setShowForm: Setter<boolean>
	editing: Accessor<E | null>
	setEditing: Setter<E | null>
	error: Accessor<string>
	setError: Setter<string>
	form: Accessor<TForm>
	setForm: Setter<TForm>
	openCreate: (value: TForm) => void
	openEdit: (entity: E, value: TForm) => void
	close: () => void
	/** Prevent default, clear error, run `save`; close on success, show message on failure. */
	submit: (e: Event, save: () => Promise<void>) => Promise<void>
}

/**
 * Shared CRUD form state: `showForm` / `editing` / `error` / `form` signals
 * plus `openCreate` / `openEdit` / `submit` boilerplate.
 *
 * Composes with {@link patchForm} — callers still use `patchForm(setForm, …)`
 * for individual inputs; this hook only owns the open/edit/submit shell.
 */
export function useCrudForm<TForm extends object, E>(initialForm: TForm): CrudFormState<TForm, E> {
	const [showForm, setShowForm] = createSignal(false)
	const [editing, setEditing] = createSignal<E | null>(null)
	const [error, setError] = createSignal('')
	const [form, setForm] = createSignal<TForm>(initialForm)

	function openCreate(value: TForm): void {
		setEditing(null)
		setForm(() => value)
		setError('')
		setShowForm(true)
	}

	function openEdit(entity: E, value: TForm): void {
		setEditing(() => entity)
		setForm(() => value)
		setError('')
		setShowForm(true)
	}

	function close(): void {
		setShowForm(false)
	}

	async function submit(e: Event, save: () => Promise<void>): Promise<void> {
		e.preventDefault()
		setError('')
		try {
			await save()
			setShowForm(false)
		} catch (err) {
			setError((err as Error).message)
		}
	}

	return {
		showForm,
		setShowForm,
		editing,
		setEditing,
		error,
		setError,
		form,
		setForm,
		openCreate,
		openEdit,
		close,
		submit,
	}
}

/** Confirm, run `remove`, then `refetch` — the shared CRUD delete boilerplate. */
export async function removeWithConfirm(
	message: string,
	remove: () => unknown,
	refetch?: () => unknown,
): Promise<void> {
	if (!confirm(message)) {
		return
	}
	await remove()
	await refetch?.()
}
