// Copies the static web app into ./www so Capacitor can bundle it into the iOS app.
// Keeps the repo root usable as a plain PWA while giving Capacitor a clean webDir.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "www");
const INCLUDE = ["index.html", "manifest.webmanifest", "css", "js", "icons", "fonts"];

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src)) copy(path.join(src, e), path.join(dst, e));
  } else {
    fs.copyFileSync(src, dst);
  }
}

rmrf(out);
fs.mkdirSync(out, { recursive: true });
for (const item of INCLUDE) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) copy(src, path.join(out, item));
}
console.log("Staged web assets into ./www");
