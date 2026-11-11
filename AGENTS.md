# AGENTS.md

**First: read `PROJECT_CONTEXT.md`.** Keep it updated after every meaningful change (feature, fix, decision, dependency, structure change) and before ending any session that changed files. Rewrite stale parts; no secrets.

## Commands (Windows, run from repo root)
- Install JS deps: `npm install`
- Run app (dev, hot reload): `npm run app:dev`  (= `tauri dev`; starts Vite on :1420 + Rust app)
- Build installer: `npm run app:build`  (NSIS → `src-tauri/target/release/bundle/nsis/`)
- Typecheck frontend: `npx tsc --noEmit`
- Rust only: `cd src-tauri && cargo build`
- Animation preview in a normal browser (no Tauri): `npm run dev` → http://localhost:1420/preview.html
- Rust lives in `%USERPROFILE%\.cargo\bin` — add to PATH in Git Bash: `export PATH="$HOME/.cargo/bin:$PATH"`

## Gotchas
- Smart App Control is ON on the owner PC: it may block freshly built unsigned exes / cargo build scripts ("An Application Control policy has blocked this file", os error 4551). If `tauri dev` can't launch the exe, run `npx vite` and start `src-tauri/target/debug/tinyvirtualcutie.exe` directly. Never change security settings yourself.
- Page errors are forwarded to stdout as `[pet] ...` via the `log` command; capture with `Start-Process ... -RedirectStandardOutput`.
- Screen capture via GDI can't see the WebView2 window; ask the owner for visual checks.

## Rules
- Pet core must run without any LLM/network. AI features are opt-in, on demand, permission-gated (file deletes, shell commands, external sends need owner approval).
- Performance first: no rAF/render loop when idle. Animator only draws while a clip plays; idle breathing is a CSS animation. Never add polling timers that run forever at high frequency.
- Characters must be data-driven so new animals reuse the same behaviours.
- `src/art/dumbo.js` is the Claude Design generator copied verbatim from `design/.../Dumbo Poses.dc.html`. Don't hand-edit geometry; any local fix must be listed in its header comment.
- Never move/resize other apps' windows (the "push window" action is fake).
- Don't touch `design/` (owner's exported source art).

## Code style
TypeScript strict, ES modules, no UI framework in the pet window (keep it light). Rust: Tauri 2, keep `lib.rs` small; frontend owns state schema, Rust just stores the JSON.
