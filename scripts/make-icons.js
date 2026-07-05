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

// A bold geometric "FT" monogram built from rounded bars (not system-font
// text, so it rasterizes identically everywhere sharp/librsvg runs — no font
// availability to gamble on). Letters are laid out symmetrically around the
// canvas center (512,512), so `mark` can just scale the whole group toward
// that same point for the smaller splash-screen mark.
function svg(size, mark = 1) {
  const s = 1024, r = 20;
  const bars = [
    // F: vertical stem, top bar, shorter middle bar
    [182, 232, 90, 560, r],
    [182, 232, 300, 90, r],
    [182, 472, 220, 80, 16],
    // T: top bar, centered vertical stem
    [542, 232, 300, 90, r],
    [647, 232, 90, 560, r],
  ];
  const rects = bars.map(([x, y, w, h, rr]) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rr}" fill="url(#g)"/>`).join("");
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${GREEN_HI}"/><stop offset="1" stop-color="${GREEN_LO}"/>
      </linearGradient></defs>
      <rect width="${s}" height="${s}" fill="${BG}"/>
      <g transform="translate(512 512) scale(${mark}) translate(-512 -512)">${rects}</g>
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
