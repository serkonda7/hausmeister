import { fileURLToPath } from "node:url";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteSolid from "vite-plugin-solid";

// NITRO_OUTPUT_DIR builds somewhere other than .output (used by `bun run e2e`,
// so its build never clobbers the shared .output).
const outDir = process.env.NITRO_OUTPUT_DIR;

export default defineConfig({
  server: { port: 3000 },
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            // Zod and src/lib/zod-config.ts share one chunk, so `jitless` is set the moment Zod loads.
            // Otherwise a shared chunk that creates schemas at load (lib/item-types/fields.ts) can run before the entry's z.config() and trip the CSP (no 'unsafe-eval').
            codeSplitting: {
              groups: [
                {
                  name: "zod",
                  test: /[\\/]node_modules[\\/]zod[\\/]|[\\/]src[\\/]lib[\\/]zod-config\.ts$/,
                },
              ],
            },
          },
        },
      },
    },
  },
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      strategy: ["baseLocale"],
    }),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "bun",
      plugins: ["./src/nitro/startup.ts"],
      ...(outDir ? { output: { dir: outDir }, buildDir: `${outDir}/.nitro` } : {}),
    }),
    viteSolid({ ssr: true }),
  ],
});
