// MapLibre GL 6 resolves its web worker relative to import.meta.url, which breaks once the
// library is bundled. Serve the worker (and the shared chunk it imports) as static files instead.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const distDir = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "maplibre");

mkdirSync(outDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(distDir, file), join(outDir, file));
}
