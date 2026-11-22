// Generates src/routeTree.gen.ts and src/paraglide/ without starting a server,
// so `typecheck` and `test` work on a fresh checkout. Resolving the Vite config
// runs the TanStack Router generator and the Paraglide compiler (configResolved hooks).
import { resolveConfig } from "vite";

await resolveConfig({ configFile: "vite.config.ts", logLevel: "warn" }, "serve", "development");
