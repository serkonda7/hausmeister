// Imported first by src/router.tsx, before any schema module. Zod 4 probes
// `new Function` when an object schema is created (its JIT); under the app's
// strict CSP (no 'unsafe-eval', server/http/csp.ts) the browser reports that
// probe as a violation even though Zod catches it. jitless skips the probe.
import { z } from "zod";

z.config({ jitless: true });
