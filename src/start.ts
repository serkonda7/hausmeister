// TanStack Start options (picked up from src/start.ts).
// SPA: the server renders only the root shell (src/routes/__root.tsx); every
// route's beforeLoad, loader and component run in the browser.
import { createStart } from "@tanstack/solid-start";

export const startInstance = createStart(() => ({ defaultSsr: false }));
