// Generates the FitTrack app icon (a bold app-blue "X" on the app's near-black
// background) at every size the web app, SideStore listing, and — via
// @capacitor/assets in CI — the native iOS AppIcon need.
// Source of truth for the icon: the SVG string below. Run: node scripts/make-icons.js
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const BG = "#08080a";          // app background (near-black)
const BLUE_HI = "#3f83ec";     // lighter end of the app-blue family (legibility on black)
const BLUE_LO = "#215cda";     // --blue used across the app

// A clean, bold X: two rounded bars crossing at the centre. `mark` scales the
// X within the canvas (1 = icon fills most of it, smaller = splash breathing room).
function svg(size, mark = 1) {
  const s = 1024, c = s / 2, half = 300 * mark, w = 150 * mark, r = 42 * mark;
  const bar = (rot) =>
    `<rect x="${c - w / 2}" y="${c - half}" width="${w}" height="${half * 2}" rx="${r}" ` +
    `transform="rotate(${rot} ${c} ${c})" fill="url(#g)"/>`;
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${BLUE_HI}"/><stop offset="1" stop-color="${BLUE_LO}"/>
      </linearGradient></defs>
      <rect width="${s}" height="${s}" fill="${BG}"/>
      ${bar(45)}${bar(-45)}
    </svg>`
  );
}

const icons = [
  ["assets/icon.png", 1024],        // @capacitor/assets source → native iOS AppIcon
  ["icons/icon-1024.png", 1024],
  ["icons/icon-512.png", 512],
  ["icons/icon-192.png", 192],
  ["icons/apple-touch-icon.png", 180],
];
// Launch screen: same mark, smaller, on the app background.
const splashes = [
  ["assets/splash.png", 2732, 0.42],
  ["assets/splash-dark.png", 2732, 0.42],
];

(async () => {
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  for (const [rel, size] of icons) {
    await sharp(svg(size)).png().toFile(path.join(root, rel));
    console.log("wrote", rel, size + "px");
  }
  for (const [rel, size, mark] of splashes) {
    await sharp(svg(size, mark)).png().toFile(path.join(root, rel));
    console.log("wrote", rel, size + "px");
  }
})();
