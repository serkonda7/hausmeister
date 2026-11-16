import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import viteSolid from "vite-plugin-solid";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  server: { port: 3000 },
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [tanstackStart(), nitro({ preset: "bun" }), viteSolid({ ssr: true })],
});
