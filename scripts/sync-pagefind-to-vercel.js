import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "dist", "pagefind");
const outDir = path.join(root, ".vercel", "output", "static", "pagefind");
const configPath = path.join(root, ".vercel", "output", "config.json");

function copyDirRecursive(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(src, dest);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}

function removeDirSafe(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

if (!fs.existsSync(srcDir)) {
  console.log("[sync-pagefind] dist/pagefind not found, skip sync.");
  process.exit(0);
}

removeDirSafe(outDir);
copyDirRecursive(srcDir, outDir);
console.log("[sync-pagefind] Synced dist/pagefind to .vercel/output/static/pagefind.");

if (!fs.existsSync(configPath)) {
  console.log("[sync-pagefind] .vercel output config not found, skip guard route patch.");
  process.exit(0);
}

try {
  const raw = fs.readFileSync(configPath, "utf8");
  const json = JSON.parse(raw);
  json.routes = Array.isArray(json.routes) ? json.routes : [];
  const hasRule = json.routes.some((route) => route?.src === "/pagefind/(.*)" && route?.dest === "/pagefind/$1");
  if (!hasRule) {
    json.routes.unshift({ src: "/pagefind/(.*)", dest: "/pagefind/$1" });
    fs.writeFileSync(configPath, JSON.stringify(json, null, 2));
    console.log("[sync-pagefind] Added download-client guard route to .vercel/output/config.json.");
  }
} catch (error) {
  console.log("[sync-pagefind] Failed to patch .vercel/output/config.json:", error instanceof Error ? error.message : String(error));
}
