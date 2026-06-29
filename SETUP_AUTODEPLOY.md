# FitTrack — auto-deploy + private SideStore source

This is the "Option 2" setup: your **code stays in a private repo**, and a tiny
**public, unguessably-named "dist" repo** hosts only the `source.json` + `.ipa`
so SideStore can auto-update. Your Flashback users never see it — they only have
your Flashback source URL, not this one.

## The two repos

| Repo | Visibility | Holds | Who reads it |
|------|-----------|-------|--------------|
| `fittrack` (any name) | **Private** | All source code + the build workflow | You + Claude (pushes here) |
| e.g. `ft-dist-7q2x` | **Public** (random name) | Only `source.json`, `FitTrack-unsigned.ipa`, icon — as a `latest` release | SideStore on your phone |

> Why the dist repo is public: a SideStore source must be fetched over the internet
> with no login. A private repo's files can't be. Giving the public repo a random
> name means nobody can find it — and even if someone did, all they'd get is the app
> binary (your personal data never leaves your phone).

## The flow (once set up)

```
Claude edits code → pushes to PRIVATE repo
        │
        ▼
GitHub Actions (private repo) builds the unsigned .ipa on a free macOS runner
        │
        ▼
Workflow publishes .ipa + source.json to the PUBLIC dist repo's "latest" release
        │
        ▼
SideStore (has the dist source URL) sees the new version → shows "Update"
```

## One-time setup (you do this once)

1. **Create both repos** on GitHub:
   - `fittrack` — **Private**.
   - a dist repo with a random name, e.g. `ft-dist-7q2x` — **Public**, empty.
2. **Make a fine-grained Personal Access Token** for the dist repo:
   GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new*.
   - Repository access: *Only select repositories* → your dist repo.
   - Permissions: **Contents → Read and write**.
   - Copy the token.
3. **Add it to the PRIVATE repo** → Settings → Secrets and variables → Actions:
   - **Secret** named `DIST_TOKEN` = the token from step 2.
   - **Variable** named `DIST_REPO` = `your-username/ft-dist-7q2x`.
4. **Tell Claude** the private repo URL so it can push (and set up auth — see below).
5. **Add the source in SideStore** (once the first build has published):
   - Source URL: `https://github.com/your-username/ft-dist-7q2x/releases/latest/download/source.json`
   - SideStore → Sources → ＋ → paste → Add. FitTrack appears; tap **Get** to install.

## Letting Claude push for you

To push on your behalf, Claude needs the private repo as a git remote with cached
credentials. Easiest, without sharing a token in chat:

```sh
# you run this once, in this folder, after creating the private repo:
git remote add origin https://github.com/your-username/fittrack.git
git push -u origin main      # Git Credential Manager opens a browser to log in once
```

After that one manual push, the credential is cached and Claude can run
`git push` non-interactively whenever you authorize an update.

(Prefer a token instead? Generate a second fine-grained PAT for the *private* repo
with Contents: Read/Write and tell Claude — it'll set the remote to use it. The
token is stored locally in `.git/config`, never committed.)

## Updating later

You say "push the update" → Claude commits + pushes → CI builds + publishes →
SideStore shows the update on your phone. Your on-device data is always preserved.
