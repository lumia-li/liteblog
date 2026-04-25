import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const postsDir = path.join(root, "src", "content", "posts");

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const titleArg = process.argv.slice(2).join(" ").trim() || "new-post";
const slug = slugify(titleArg) || `post-${Date.now()}`;
const filename = `${slug}.md`;
const fullPath = path.join(postsDir, filename);

if (fs.existsSync(fullPath)) {
  console.error(`[new-post] File already exists: ${fullPath}`);
  process.exit(1);
}

const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const template = `---\ntitle: ${titleArg}\npublished: ${date}\nupdated: ${date}\ndescription: \ntags:\n  -\ncategory: \ndraft: true\n---\n\n`;

fs.mkdirSync(postsDir, { recursive: true });
fs.writeFileSync(fullPath, template, "utf8");
console.log(`[new-post] Created: ${fullPath}`);
