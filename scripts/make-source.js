// Regenerates sidestore/source.json with the real version, file size and
// download URL after a build. Run by the CI workflow.
// Env: GH_OWNER, GH_REPO, IPA_PATH (defaults to FitTrack-unsigned.ipa)
const fs = require("fs");
const path = require("path");

const owner = process.env.GH_OWNER || "OWNER";
const repo = process.env.GH_REPO || "REPO";
const ipaPath = process.env.IPA_PATH || "FitTrack-unsigned.ipa";
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
const version = pkg.version || "2.0.0";
const size = fs.existsSync(ipaPath) ? fs.statSync(ipaPath).size : 0;
const base = `https://github.com/${owner}/${repo}/releases/latest/download`;

const source = {
  name: "FitTrack (Private)",
  identifier: "app.fittrack.personal.source",
  subtitle: "Personal weight-loss tracker",
  iconURL: `${base}/icon-512.png`,
  apps: [{
    name: "FitTrack",
    bundleIdentifier: "app.fittrack.personal",
    developerName: "Private build",
    subtitle: "Calorie, weight & habit tracker",
    localizedDescription: "Personal calorie, weight and habit tracker with rings, streaks, supplements, walk tracking and dual goals.",
    iconURL: `${base}/icon-512.png`,
    tintColor: "2ee6a6",
    category: "lifestyle",
    versions: [{
      version,
      date: new Date().toISOString().slice(0, 10),
      downloadURL: `${base}/FitTrack-unsigned.ipa`,
      size,
      minOSVersion: "14.0",
    }],
  }],
};

const out = path.resolve(__dirname, "..", "sidestore", "source.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(source, null, 2) + "\n");
console.log(`Wrote ${out} (v${version}, ${size} bytes, ${owner}/${repo})`);
