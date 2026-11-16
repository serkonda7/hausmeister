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
