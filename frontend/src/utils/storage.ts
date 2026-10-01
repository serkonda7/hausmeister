// localStorage can be unavailable (e.g. private browsing); treat failures as "nothing stored".

export function loadStored(key: string): string | null {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

export function store(key: string, value: string | null): void {
	try {
		if (value === null) localStorage.removeItem(key)
		else localStorage.setItem(key, value)
	} catch {
		// Ignore persistence failures.
	}
}
