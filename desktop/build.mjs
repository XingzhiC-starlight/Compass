// Builds the desktop app into desktop/out (spec §22): the page, exactly as `npm run build`
// makes it but with no Supabase values, whatever the shell or a .env file holds; the main
// process, as one file; and beside them the preload and the menu-bar icons, copied as they are.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const OUT = path.join(HERE, "out");

// The desktop app keeps its data on the device (I19): its page is built with no Supabase
// project and no CAPTCHA key, and reads no .env file.
for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_TURNSTILE_SITE_KEY"]) {
  process.env[name] = "";
}

fs.rmSync(OUT, { recursive: true, force: true });

await build({
  root: ROOT,
  configFile: path.join(ROOT, "vite.config.ts"),
  envDir: false,
  logLevel: "warn",
  build: { outDir: path.join(OUT, "app"), emptyOutDir: true },
});

await build({
  root: ROOT,
  configFile: false,
  envDir: false,
  logLevel: "warn",
  publicDir: false,
  build: {
    ssr: path.join(HERE, "main.ts"),
    outDir: OUT,
    emptyOutDir: false,
    target: "node22",
    minify: false,
    rollupOptions: { output: { format: "es", entryFileNames: "main.js" } },
  },
});

fs.copyFileSync(path.join(HERE, "preload.cjs"), path.join(OUT, "preload.cjs"));
fs.mkdirSync(path.join(OUT, "icons"), { recursive: true });
// The menu-bar icons alone: the app's own icon is the packager's to place (package.config.mjs).
for (const icon of fs.readdirSync(path.join(HERE, "icons")).filter((name) => /^menuBarTemplate.*\.png$/.test(name))) {
  fs.copyFileSync(path.join(HERE, "icons", icon), path.join(OUT, "icons", icon));
}

console.log(`Built the desktop app into ${path.relative(ROOT, OUT)}.`);
