// Slow links (phones over the VPN): the server-rendered page shows up long
// before its JavaScript runs. Until the app has hydrated, a tap on "Anmelden"
// or Enter in a field would submit the form natively (and lose what was
// typed), and Solid would overwrite what was typed into controlled inputs.
//
// The rule for forms that matter (login, invite, quick add, list search):
// - submit buttons use `useHydrated()`: disabled with "Lädt …" until hydrated
//   (a disabled default button also blocks Enter's implicit submission);
// - uncontrolled inputs (login, invite) can be typed into early and keep it;
// - controlled inputs take over early typing with `adoptTypedValue`;
// - a form whose other controls cannot keep early input (quick add) is wrapped
//   in `<fieldset disabled={!hydrated()}>`.
// <html data-hydrated> marks the moment (e2e tests wait for it, too).
import { createSignal, onMount } from "solid-js";

const G = globalThis as unknown as { __hausmeisterHydrated?: boolean };

/** Marks the document as hydrated (called once from the root document). */
export function markHydrated() {
  G.__hausmeisterHydrated = true;
  document.documentElement.setAttribute("data-hydrated", "");
}

/**
 * False during SSR and the hydration render (so markup matches), true once
 * mounted. On client-side navigations after the first hydration it starts true.
 */
export function useHydrated(): () => boolean {
  const [hydrated, setHydrated] = createSignal(
    typeof window !== "undefined" && G.__hausmeisterHydrated === true,
  );
  onMount(() => setHydrated(true));
  return hydrated;
}

/**
 * A ref for a controlled text input: when hydration claims the server-rendered
 * element and the user already typed into it, hand that text to `set` before
 * Solid writes the (empty) signal value back into the field.
 */
export function adoptTypedValue(
  current: () => string,
  set: (v: string) => void,
): (el: HTMLInputElement | HTMLTextAreaElement) => void {
  return (el) => {
    if (el.value && el.value !== current()) set(el.value);
  };
}
