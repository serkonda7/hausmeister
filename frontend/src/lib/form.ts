import type { Setter } from 'solid-js'

/** Immutable single-field update without the `setForm({ ...form(), … })` spread. */
export function patchForm<T extends object, K extends keyof T>(
	setForm: Setter<T>,
	key: K,
	value: T[K],
): void {
	setForm((prev) => ({ ...prev, [key]: value }))
}
