// Generates the FitTrack app icon (a bold "FT" monogram in the app's green on
// its near-black background) at every size the web app, SideStore listing,
// and — via @capacitor/assets in CI — the native iOS AppIcon need.
// Source of truth for the icon: the SVG string below. Run: node scripts/make-icons.js
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const BG = "#08080a";          // app background (near-black)
const GREEN_HI = "#3fe873";    // lighter end of the app-green family (legibility on black)
const GREEN_LO = "#08c343";    // --accent used across the app

// A bold "FT" wordmark set in Segoe UI Black. NOTE: this depends on Segoe UI
// being installed (Windows-only) — the script must be re-run on a Windows
// box if the icon ever needs regenerating; only the rasterized PNGs are
// committed/shipped, never the font itself (Segoe UI isn't redistributable).
// Centered empirically (librsvg's dominant-baseline support is inconsistent),
// verified against crosshairs at (512,512) — see scratchpad renders.
function svg(size, mark = 1) {
  const s = 1024;
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${GREEN_HI}"/><stop offset="1" stop-color="${GREEN_LO}"/>
      </linearGradient></defs>
      <rect width="${s}" height="${s}" fill="${BG}"/>
      <g transform="translate(512 512) scale(${mark}) translate(-512 -512)">
        <text x="512" y="687" font-family="Segoe UI Black, Segoe UI" font-weight="900" font-size="500"
          text-anchor="middle" fill="url(#g)" letter-spacing="-10">FT</text>
      </g>
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
