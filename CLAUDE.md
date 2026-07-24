# FitTrack — working instructions

Personal weight-loss tracker app. Vanilla HTML/CSS/JS (no framework, no bundler), wrapped in Capacitor for an unsigned iOS IPA sideloaded via SideStore. Public repo `owensvin/fittrack` on GitHub.

For feature history, architecture decisions, and past bugs/gotchas, see the auto-memory file (`fittrack-weight-loss-app.md` in the memory system) — that's the detailed log. This file is the short operational checklist so instructions don't need to be repeated every session.

## Git / GitHub push workflow

- **Two GitHub accounts exist on this machine**: `owensvin` (owns this repo) and `deknared` (the user's main account, unrelated). Before pushing, check `gh auth status` — if `owensvin` isn't the active account, run `gh auth switch --hostname github.com --user owensvin` first (do NOT do a raw `gh auth login` interactive flow yourself — that requires a browser/interactive step; ask the user to run it if `owensvin` isn't already a known account).
- **Never handle a raw GitHub token/PAT directly** — not as a literal in a Bash command, not written to a file, not piped. The sandbox's credential-leakage guard blocks this categorically regardless of technique, and retrying with a different trick won't work. If a token-based approach is needed, stop and ask the user to set up `gh auth` themselves instead.
- Once `owensvin` is the active `gh` account, a plain `git push origin main` works with no credentials in the command at all.
- **After pushing, switch back**: `gh auth switch --hostname github.com --user deknared` — the user's other projects need `deknared` active, and leaving `owensvin` active has broken their other sessions before. Chain it into the same command as the push.
- **After pushing, do NOT poll the Actions build for completion/outcome** — it wastes tokens for no benefit. Just fetch and share the direct run URL once (e.g. via the GitHub API or `gh run list`), then stop. The user checks it themselves.
- **Before shipping any version bump**: bump `package.json` `"version"` AND the `APP_VERSION` const in `js/app.js` AND add a matching entry to the `WHATS_NEW` object in `js/app.js`. SideStore compares `source.json`'s version against the IPA's actual version — if they don't match (or didn't change), install fails or silently doesn't update.
- **"Production sweep" before pushing a release**: before committing a version bump, sweep for regressions/leftovers —
  - No hardcoded personal defaults reintroduced (onboarding `value=` attrs, supplement lists, goal values, etc.) — this has bitten past sessions twice already.
  - No dangling references to removed element ids/functions (`grep` for anything renamed/deleted this session).
  - No test/debug data or `console.log`/`console.error` left behind.
  - Changelog (`WHATS_NEW`) entry added and reads cleanly.

## Removed features (do not re-add without reading this)

- **Apple Health / HealthKit — removed in v3.6.0 (2026-07-10).** Root cause was external and unfixable from this repo: SideStore's free-account re-sign strips `com.apple.developer.healthkit` because it isn't in `ALTFreeDeveloperCanUseEntitlement` (SideStore/AltSign `Sources/ALTCapabilities.swift` — whitelist is app-groups, inter-app-audio, get-task-allow, increased-memory-limit, team-identifier, keychain-access-groups, application-identifier). The app/CI side was *correct* (entitlement embedded via ad-hoc codesign since v3.1). Everything was deleted in the v3.6.0 commit: Settings card, `syncAppleHealth`/`renderHealthSettings`, `settings.appleHealth`, `plugins/healthkit/`, the `fittrack-healthkit` dependency, and the workflow's NSHealthShareUsageDescription + entitlement + ad-hoc-sign steps. **To restore**: everything lives intact at commit `a05e8d4` (v3.5.1). Only worth restoring if SideStore whitelists HealthKit upstream or the user gets a paid Apple Developer account with real signing.

## Planning workflow

- For each new feature/improvement request (not a one-line fix), lay out a short concrete plan first — what changes, in which files, and any real design decisions/ambiguities — before making edits. Keep it brief; this is so the user can redirect early, not a formal design doc.
- If a request has a genuine UX/architecture ambiguity (not just an implementation detail), ask via a quick clarifying question rather than guessing and rebuilding later.

## Preview / testing

- CSS/JS/HTML edits need a cache-bust on reload: `location.href = '/index.html?v=' + Date.now()` — plain `location.reload()` can serve a stale cached copy of `css/style.css` or large JS/asset files.
- The preview screenshot action occasionally hangs (known flaky in this environment, not a real app issue) — if it times out, don't retry it in a loop; verify via JS evaluation (DOM state, `getBoundingClientRect`, `getComputedStyle`) and the accessibility-tree read instead, both of which are reliable substitutes.
- Native `confirm()`/`alert()`/`prompt()` block the automation tab indefinitely — never click a confirm-guarded button in the preview; call the underlying function directly.
- localStorage seed data does NOT persist across sessions — re-seed a test profile each session, and clear it (`localStorage.removeItem("fittrack")`) when done.
- Always verify UI changes actually render/behave correctly via the preview tools before reporting a UI task done — don't rely on reading the code alone.

## Shared food library backend (worker/)

- Live Cloudflare Worker + D1: `https://fittrack-foods.owensvin.workers.dev`. `SHARED_FOODS_API` in `js/app.js` points at it — empty string turns the whole feature off in the app.
- **Two Cloudflare accounts exist on this machine, same collision as GitHub**: the FitTrack worker/D1 lives under the **owensvin** account (`b5b217182a864cf63f51af9d3609ded7`); wrangler frequently ends up authed to the user's **deknared** account (`gavrielowens11@gmail.com`) from other projects. Check with `npx wrangler whoami` BEFORE any remote command — a wrong-account token fails with `code: 7403 "account is not valid or is not authorized"`, which looks like a permissions bug but is just the wrong login. Fixing it needs an interactive `npx wrangler login` (browser) — ask the user; don't attempt the OAuth flow unattended.
- **Local development needs no cloud auth**: `npx wrangler dev --local` + `npx wrangler d1 execute fittrack-foods --local ...` run against miniflare/local D1, so the worker can be built and fully tested while remote auth is broken. Local secrets go in `worker/.dev.vars` (gitignored).
- **Writes require the library key** (`X-FitTrack-Key`, set in production with `npx wrangler secret put LIBRARY_KEY`, pasted by each user into Settings → Shared library). Reads stay open. Each row also records an opaque `owner` (per-install id) and only that install may edit/delete it; rows with an empty owner predate the column and any key holder may adopt them.
- Redeploy after editing `worker/src/index.js`: `npx wrangler deploy` from `worker/`. **Deploys propagate over ~30s and requests can hit a MIX of old and new versions in that window** — if endpoint tests look impossible right after a deploy, wait and re-test before debugging.
- Moderation/fixes: `npx wrangler d1 execute fittrack-foods --remote --command "..."` from `worker/`. **The library has real user data now — delete test rows by id, never `DELETE FROM foods` wholesale.**
