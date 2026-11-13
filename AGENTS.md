# AGENTS.md

**First: read `PROJECT_CONTEXT.md`.** Keep it updated after every meaningful change (feature, fix, decision, dependency, structure change) and before ending any session that changed files. Rewrite stale parts; no secrets.

## Commands (Windows, repo root)
- Install deps: `npm install`
- Run in dev (Vite hot reload + Electron): `npm run dev`
- Typecheck: `npm run typecheck`
- Build pages: `npm run build` (→ `dist/`)
- Shareable portable build: `npm run package` → `release/Dumbo/` + `release/Dumbo-<version>-win-x64.zip`
- Install/update for this user: `npm run install-app` (packages, copies to `%USERPROFILE%\Apps\Dumbo\Dumbo\`, launches via Explorer; settings kept; Dumbo makes his own shortcuts)
- Regenerate icons after art changes: `npm run icons`
- Animation preview in a normal browser: `npx vite` → http://localhost:1420/preview.html
- Installers (CI only, never locally): GitHub Actions → "Build Dumbo" → Run workflow → Windows Setup exe + zip, macOS .dmg (`scripts/mac-dmg.sh`, runs on the mac runner only)
- Release: bump `version` in package.json, commit, `git tag v<version>` + `git push origin main --tags` (CI signs + publishes to public repo; installed copies self-update)
- Perf benchmark: `scripts/bench.sh live|idle|f10|s10` (avg % of one core, 60 s; Git Bash)
- Offscreen screenshot of any HTML: `npx electron scripts/snap.cjs <in.html> <out.png> [w] [h]`

## Gotchas
- Claude desktop app is MSIX-packaged: processes started from this agent get **AppData and HKCU writes silently redirected** to `%LOCALAPPDATA%\Packages\Claude_*\LocalCache` (and reads see a merged view). Never install or store app state under AppData from here; never trust what you read back from AppData/HKCU as "real". Use `%USERPROFILE%\Apps\Dumbo\boot.json` (written by the real app) to verify autostart etc.
- Scenario tests (dev): `DUMBO_BENCH=edge npm run dev` (grab mid-fall, tray Sleep during hide and seek, below-screen recovery; logs `edge …`); `DUMBO_BENCH=perch npm run dev` (simulated window, logs perch positions); `DUMBO_BENCH=tryall npm run dev` (runs every ▶ Try action, logs `try <id>: …`; `DUMBO_BENCH=try:walk,run` for a subset; preset `settings.tune` in the temp state.json to test knobs). Use `DUMBO_STATE_DIR=<temp>` so they never touch real settings. Port 1420 must be free (stop any `npx vite` preview first).
- New actions: add to `src/actions.ts` (settings list + ▶ Try + ⚙ knobs come free), gate with `on(id)` / weight with `w(id, …)` in `src/main.ts`, use `reps()` / `stroll()` / `tune()` for knobs, add a `tryAction` case.
- Anything that moves his window in a timer loop (fall, jump, slide) must stop when `motion` changes (bumped on grab), and code after an `await` must not set `mode` while `dragging`.
- **Smart App Control is ON** on the owner PC and must stay on. It blocks any freshly compiled/unsigned exe. That's why the app runs on the stock Electron runtime (byte-identical, just renamed `Dumbo.exe`). Never add a build step that produces or modifies an .exe (no electron-builder/packager, no rcedit, no Rust/Tauri, no self-extracting exe). Packaging = copy stock runtime + `resources/app.asar`. Never change security settings.
- Every drawn frame costs ~10–30 ms CPU in Electron (SVG redraw + transparent window present). Don't add continuous animations (no CSS infinite animations, no always-on rAF). Keep clips at 8–14 fps; eyes jump in single-frame saccades.
- Measure CPU with `Get-Counter '\Process(electron*)\% Processor Time'` (bench script). `Get-Process` CPU deltas gave wrong (zero) numbers.
- The Browser pane can stall when the app window is hidden; use `scripts/snap.cjs` for visual checks. GDI screen capture can't see the pet window.
- Click-through (`setIgnoreMouseEvents` + forward): never rely only on forwarded mousemove; the host hover poll covers him moving under a still cursor. `DUMBO_BENCH` runs log `over true/false`.
- Host timers and late messages must use `alive()` / `sendPet()` in `electron/main.cjs` (window may be destroyed while quitting). Test env: `DUMBO_TEST_RESUME=<ms>` fakes wake-from-sleep, `DUMBO_TEST_QUIT=<ms>` quits.
- Renderer errors and `host.log()` print to the Electron main stdout as `[pet] ...`.

## Rules
- Pet core must run without LLM/network. AI features later: opt-in, on demand, permission-gated (file deletes, shell commands, external sends need owner approval).
- Characters must be data-driven so new animals reuse the same behaviours.
- `src/art/dumbo.js` and `src/art/face.js` are Claude Design generators copied from `design/.../Dumbo Poses.dc.html` and `Dumbo Expressions.dc.html`. Don't hand-edit geometry; list every local patch in the file header.
- Never move/resize other apps' windows (the "push window" action is fake).
- Don't edit `design/` (owner's exported source art).
- Commit after each meaningful step (owner asked for continuous commits). End commit messages with the Co-Authored-By line given by the harness.

## Code style
TypeScript strict, ES modules, no UI framework. Electron main/preload are CommonJS (`.cjs`). Keep the preload bridge narrow and explicit.

## Updates (electron/updater.cjs, boot.cjs)
- Never commit the update signing key (Ed25519 private PEM). It lives only in the private repo secret `UPDATE_SIGNING_KEY` and the owner's backup. Public half is in `electron/common.cjs`; changing it locks out existing installs.
- Updates swap Dumbo's code/art only. A change that needs a new Electron runtime (bumping `electron` major) can't auto-update: users get "Download vX" instead.
- Test updates with a copy of `release/Dumbo` + `DUMBO_STATE_DIR=<temp> DUMBO_UPDATE_URL=http://localhost:<port> DUMBO_UPDATE_DELAY=3000` — never against `%USERPROFILE%\Apps\Dumbo`. Pre-set `shortcutsFor` in the test state.json or the test copy overwrites the real Desktop shortcut.

## macOS
- Host code branches on `IS_MAC` / `IS_WIN` in `electron/main.cjs`. Windows-only: winwatch (PowerShell UIA), shortcuts, NSIS. macOS: menu-bar tray (`assets/tray.png` as 2x), `pmset` battery, `app.dock.hide()` + `LSUIElement`, state in `~/Library/Application Support/Dumbo`.
- No Apple Developer account: the app is ad-hoc signed in CI; users click "Open Anyway" once. Don't add notarization/hardened-runtime steps without a paid account.
- Nobody on the team can run macOS locally; every Mac change is verified only by CI + a real Mac user.

## Performance modes
- Anything that must be decided before `app.whenReady()` goes at the top of `electron/main.cjs`, not `boot.cjs`: copies updated over the internet keep running their originally shipped `boot.cjs`.
- Battery saver checks go through `saving()` / `slow()` / `track()` in `src/main.ts`; don't call `host.track` directly.
- Speech bubbles: no emoji (owner preference).
