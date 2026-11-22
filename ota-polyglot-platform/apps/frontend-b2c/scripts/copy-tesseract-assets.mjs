#!/usr/bin/env node
/**
 * Copy tesseract.js worker + core wasm into public/ so browser OCR uses
 * same-origin assets (avoids Turbopack/CDN/blob-worker failures in Docker).
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "public", "tesseract");
const workerSrc = join(root, "node_modules", "tesseract.js", "dist", "worker.min.js");
const coreDir = join(root, "node_modules", "tesseract.js-core");

const files = [
  [workerSrc, join(dest, "worker.min.js")],
  [
    join(coreDir, "tesseract-core-simd-lstm.wasm.js"),
    join(dest, "tesseract-core-simd-lstm.wasm.js"),
  ],
  [
    join(coreDir, "tesseract-core-simd-lstm.wasm"),
    join(dest, "tesseract-core-simd-lstm.wasm"),
  ],
];

if (!existsSync(workerSrc) || !existsSync(coreDir)) {
  console.warn("[copy-tesseract-assets] tesseract packages not installed yet — skip");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const [from, to] of files) {
  cpSync(from, to);
}
console.log("[copy-tesseract-assets] wrote", dest);
