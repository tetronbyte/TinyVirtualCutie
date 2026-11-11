# AGENTS.md

**First: read `PROJECT_CONTEXT.md`.** Keep it updated after every meaningful change (feature, fix, decision, dependency, structure change) and before ending any session that changed files. Rewrite stale parts; no secrets.

## Commands (Windows, repo root)
- Install deps: `npm install`
- Run in dev (Vite hot reload + Electron): `npm run dev`
- Typecheck: `npm run typecheck`
- Build pages: `npm run build` (→ `dist/`)
- Install/update the standalone app for this user: `npm run install-app`
  (→ `%LOCALAPPDATA%\Dumbo\{runtime,app}` + Desktop/Start Menu shortcuts, then launches it; settings kept)
- Animation preview in a normal browser: `npx vite` → http://localhost:1420/preview.html
- Perf benchmark: `scripts/bench.sh live|idle|f10|s10` (avg % of one core, 60 s; Git Bash)
- Offscreen screenshot of any HTML: `npx electron scripts/snap.cjs <in.html> <out.png> [w] [h]`

## Gotchas
- **Smart App Control is ON** on the owner PC and must stay on. It blocks any freshly compiled/unsigned exe. That's why the app runs on the stock Electron runtime (byte-identical, just renamed `Dumbo.exe`). Never add a build step that produces or modifies an .exe (no electron-builder/packager, no rcedit, no Rust/Tauri). Never change security settings.
- Every drawn frame costs ~10–30 ms CPU in Electron (SVG redraw + transparent window present). Don't add continuous animations (no CSS infinite animations, no always-on rAF). Keep clips at 8–14 fps; eyes jump in single-frame saccades.
- Measure CPU with `Get-Counter '\Process(electron*)\% Processor Time'` (bench script). `Get-Process` CPU deltas gave wrong (zero) numbers.
- The Browser pane can stall when the app window is hidden; use `scripts/snap.cjs` for visual checks. GDI screen capture can't see the pet window.
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
