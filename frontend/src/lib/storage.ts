/** localStorage access that never throws (private mode, SSR, …). */
export const safeStorage = {
	get(key: string): string | null {
		try {
			return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
		} catch {
			return null
		}
	},
	set(key: string, value: string): void {
		try {
			localStorage.setItem(key, value)
		} catch {
			// ignore (private mode etc.)
		}
	},
}
