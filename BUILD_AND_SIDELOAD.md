# FitTrack — build & sideload (single public repo)

Repo: **`owensvin/fittrack`** (public, on a dedicated account unrelated to your
other projects). Every push to `main` that touches the app builds an unsigned
`.ipa` on a free GitHub Actions macOS runner and publishes it — together with a
SideStore `source.json` — to this repo's **`latest`** release. SideStore re-signs
the app on your device with your own Apple ID, so no Mac, no Apple Developer
account, and no signing certificate are needed.

## Install / update on your iPhone

SideStore → **Sources** → ＋ → add:

```
https://github.com/owensvin/fittrack/releases/latest/download/source.json
```

FitTrack shows up under that source → tap **Get** (or **Update**). Free-account
signing refreshes every ~7 days; SideStore does that automatically in the
background.

## How updates ship

You ask for a change → Claude bumps the `version` in `package.json`, commits, and
pushes to `main` → CI builds + republishes the `latest` release → SideStore shows
an update. Your on-device data is always preserved (native storage; updates don't
touch it). Still worth using Settings → **Export backup** occasionally.

### Why the version bump matters

SideStore refuses to install if the version in `source.json` doesn't match the
version baked into the IPA. The workflow stamps the IPA's `CFBundleShortVersionString`
from `package.json`'s `version` at build time, so the two always agree — but you
must **increment `package.json` `version`** for SideStore to recognise a new build
as an update.

## Building manually

Repo → **Actions** → *Build iOS IPA (unsigned)* → **Run workflow**. When it
finishes (~3–5 min) the `latest` release updates, or you can grab the
`FitTrack-ipa` artifact from the run and install that `.ipa` directly in SideStore
(My Apps → ＋).
