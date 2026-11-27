// <html data-hydrated> marks the moment the app has started in the browser
// (the shell hides its loading notice then).

/** Marks the document as started (called once from the root shell). */
export function markHydrated() {
	document.documentElement.setAttribute('data-hydrated', '')
}
