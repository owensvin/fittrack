# FitTrack — build the IPA & sideload with SideStore

This produces an **unsigned `.ipa`** in the cloud (no Mac needed) and installs it
privately on your iPhone. It is **never** added to your public SideStore source,
so your Flashback users can't see it.

## One-time setup

1. Create a **private** GitHub repo (e.g. `fittrack`). Keep it private — this is your
   personal app and the easiest way to keep it off any shared source.
2. Push this folder to it:
   ```sh
   git init
   git add .
   git commit -m "FitTrack v2"
   git branch -M main
   git remote add origin https://github.com/<you>/fittrack.git
   git push -u origin main
   ```
   (`node_modules/`, `ios/`, `www/`, and `*.ipa` are git-ignored — only source is pushed.)

## Build the IPA

- The push to `main` automatically triggers the **Build iOS IPA (unsigned)** workflow.
  You can also run it manually: repo → **Actions** tab → *Build iOS IPA (unsigned)* → **Run workflow**.
- When it finishes (~5–8 min), open the run and download the **`FitTrack-ipa`** artifact
  (a zip containing `FitTrack-unsigned.ipa`).

> Free GitHub Actions includes plenty of macOS minutes for a personal app. No Apple
> Developer account and no signing certificate are required — the build is unsigned on
> purpose because SideStore signs it on-device with your own free Apple ID.

## Sideload with SideStore

1. Get the `.ipa` onto your iPhone (AirDrop, iCloud Drive, or download in Safari → Files).
2. Open **SideStore** → **My Apps** → **＋** (top-left) → pick `FitTrack-unsigned.ipa`.
3. SideStore signs it with your Apple ID and installs it. Like any free-account sideload,
   it refreshes every ~7 days — SideStore does this automatically in the background.

That's it. Because you installed the IPA directly (not via a source URL), it stays
private to your device.

## Updating later

Change any web file → push to `main` → download the new artifact → reinstall in SideStore
over the old one. **Your data is preserved** — it lives in the app's native WKWebView
storage, which updates don't touch. (Still worth using Settings → *Export backup* now and then.)

## Want it as a plain PWA too?

The repo root is also a working PWA. Enable GitHub Pages (Settings → Pages → deploy from
`main`), open the Pages URL in Safari, and **Share → Add to Home Screen**. Note: iOS may
evict a PWA's data after ~7 days of non-use — the sideloaded app does not have that problem.
