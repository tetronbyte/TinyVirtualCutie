# PROJECT_CONTEXT — TinyVirtualCutie

## 1. Overview
Tiny on-screen desktop pet ("TinyCutie") for Windows. Lives on desktop by itself with a personality, does cute activities, reacts to user, later does small work on the computer. Personal use only (no store/signing/licensing needed).
- First character: **baby elephant, working name "Dumbo"** (name configurable). Later characters (owl, eagle, ...) reuse same features via per-character config.
- Art: soft 2D cartoon, chibi (big head, small body), dark clean outlines + soft shading, NOT pixel art, smooth animation. Two themes, same character: **Light** (lavender-grey body, pink inner ears/paw pads/blush, cream belly), **Dark "Neon"** (slate-navy body, purple inner ears, cyan→magenta neon rim glow, pink paw pads). Final reference images given in chat 2026-11-11 (not saved in repo; owner attaches them in Claude Design).

Source material: owner's handwritten notes (2026-11-11), `suggestions_idea.txt` (brainstorm), Q&A answers (2026-11-11, recorded below).

## 2. Tech stack & how to run
- **Tauri 2 (Rust) + WebView2**, frontend = Vite + TypeScript, no UI framework. Fallback if too heavy: pure Rust + Win32 layered window.
- Animation: **Claude Design's parametric pose generator** (`src/art/dumbo.js`) builds SVG from pose params; `Animator` tweens params between keyframes. No Rive, no sprite sheets.
- State: JSON at `%APPDATA%\dev.tinyvirtualcutie.dumbo\state.json` (position, theme). AI later = local model, on demand only.
- Exact commands: see `AGENTS.md` (`npm install`, `npm run app:dev`, `npm run app:build`, preview at `/preview.html`).
- Toolchain on owner PC: Node 20, Rust 1.99 (installed 2026-11-11 via winget rustup), VS 2026 Build Tools (MSVC), WebView2 157.

## 3. Structure
- `src/main.ts` — pet brain: behaviour state machine (idle/sit/walk/sleep/busy/held), interactions (click, drag/scruff, petting, tickling), tray events, theme, persistence, boot.
- `src/engine/animator.ts` — `Animator` (event-driven render, stops when idle), `blend()` pose tween, `frame(set,i)` lookup, `VIEWBOX` crop (must match window aspect 120×116).
- `src/engine/clips.ts` — named clips built from design pose frames (blink, earflap, wave, walk, run, sit/stand, fallAsleep/wakeUp, dangle, petted, tickled, happyBounce).
- `src/art/dumbo.js` (+ `.d.ts`) — generator copied verbatim from `design/.../Dumbo Poses.dc.html`; local fix: round linejoin on rim glow (dark-mode hair spike).
- `index.html` — pet window (#pet flip → #breath CSS breathing → #art SVG). `preview.html` — browser-only animation tester.
- `src-tauri/` — `src/lib.rs` (tray menu: show/hide, sleep, wake, theme auto/light/dark, quit; `load_state`/`save_state` commands), `tauri.conf.json` (transparent, frameless, always-on-top, no taskbar, 120×116), `capabilities/default.json`, `icons/` (generated from Light.png).
- `design/Dumbo Desktop Pet Mascot/` — owner's Claude Design export (source art; don't edit).
- `DESIGN_PROMPT.md`, `suggestions_idea.txt` — design/brainstorm history.

## 4. Current status
Phase: **MVP build, step 1** (2026-11-11).
- Done: project scaffold; art generator ported; animator + clips; preview verified in browser (light + dark, sleep sequence renders correctly, dark hair spike fixed).
- Built behaviours: hello earflap on start, blinking, CSS breathing, random walk along screen (moves window, flips facing, stops at edges), sit/stand, earflap, wave, falls asleep after ~1.5–4 min awake (naps 5–15 min, slower breathing), click = happy bounce / wakes him, drag = dangling by scruff (pouts if he was busy/asleep), hover = petted, fast rubbing = tickled, tray menu, theme auto + override, position remembered.
- Build/run status (2026-11-11): debug build compiles and runs; window shows bottom-right on the taskbar, boot logs "boot ok", walking moves the window. Measured (debug, dev server): idle CPU ~0% after making #breath its own GPU layer (was ~31% of a core before the fix); RAM ~240 MB private across 8 processes (WebView2 cost, well above the 10–15 MB native target).
- **Blocker: Windows Smart App Control (enforce mode) blocks unsigned freshly-built exes** (cargo build scripts, `target/debug/tinyvirtualcutie.exe` when launched by cargo). Release build fails consistently on `serde`/`icu_properties_data` build scripts. A direct `Start-Process` of the existing debug exe works. Owner must decide: turn SAC off (Windows Security → App & browser control → Smart App Control; can't be turned back on without resetting Windows) or keep dev-only.
- Visual check pending: GDI screen capture can't see WebView2/DirectComposition windows, so the on-desktop look is unverified by agent; owner to confirm.
- Not yet: settings window, autostart, battery reactions, coding/hoodie, exercises, trip, window awareness (peek/eat/push/sit on windows), taskbar-aware walking, speech bubbles, S/M/L size, click-through on transparent pixels, front/3-4 views (runtime uses side view only).
- Design files: rig/turnaround/expression SVGs + hoodie/expression sheets in `design/` — runtime currently only uses the Poses generator (side view). Remaining art nit: some 3/4 expressions have trunk overlapping far eye (not used yet).

## 5. Locked feature spec (MVP unless marked later)
**Platform/app**
- Windows first, portable core. Main monitor only (multi-monitor later).
- Autostart with Windows (toggle). Tray icon: show/hide/quit/settings. Right-click menu on pet (Sleep, Play, Hide, Settings, Quit).
- Settings window: customize behaviour (sleep times, low-energy threshold, app→action mapping, size, name, theme, toggles).
- Size ~96px default, S/M/L presets + custom resize.

**Movement**
- Walks around screen edges and along taskbar; sits on top of windows.
- Looks curiously at apps; tries to "eat" them; tries to push windows and fails (window must NOT actually move).
- Eyes follow cursor; notices active app name (no screen content reading).

**Outfit — hoodie**: cute oversized hoodie (ear slots in hood, pocket, drawstrings), worn mainly while coding: pulls it on when starting to code, hood up when "focused", takes it off after. Separate layers so it can go on/off. Colour per theme (pastel in light; charcoal + neon trim in dark).

**Actions**: idle, sleep (mostly sleeps — default personality), walk, run, sit/stand, coding on its laptop (random now; synced to user coding later), exercise (push-ups, skipping; random + "let's stretch" nudge after long sessions), ear flapping, trunk wave, tripping over trunk, flexing muscles. No clapping for now.

**Emotions** (face only, no floating symbols): excited, sad, happy, smile, laugh, confused, pout, think, tired.
- Pout: being dragged when it doesn't want to (e.g. while sleeping/busy).
- Battery-linked (laptop battery only; pet has NO separate internal energy stat — reacts only at thresholds, otherwise normal life):
  - Battery ≤ low threshold (default 30%, configurable) → tired, sad, hurries, asks to charge.
  - Charger plugged in → excited, walks then runs for a while, then back to normal.
  - Battery ≥ high threshold (default 90%, configurable) → flexes muscles + asks to unplug charger. Repeats 3 times max, then stops and resumes normal life.
  - Desktop PC / no battery → battery reactions disabled.

**Interactions**: click/poke, drag & drop, tickle (rub mouse over it), petting (hover). Keyboard/mouse only as active/idle detection — never log keystrokes.
- Canned speech bubbles (few cute lines, no AI). No sound effects. Soft ground shadow when on taskbar/edges; no shadow when sitting on window tops.
- Theme: auto-follows Windows light/dark; manual override (Light/Dark/Auto) in settings.

**Life/personality**: happiness stat only (energy mood comes from battery); never punishing, never dies; stays a baby forever. Remembers position, mood, state across restarts. Day/night aware with configurable sleep schedule. Per-character trait config; elephant = really kind.

**Later phases**
- App-triggered reactions: when owner opens a configured app, pet gets excited and does a mapped activity for a while (configurable mapping).
- Coding-sync, desktop awareness extras, local-model AI, multi-monitor, more characters.

## 6. Done log
- 2026-11-11 — Read notes + suggestions doc. Created handoff files. Q&A round 1 done; features locked; design prompt written.
- 2026-11-11 — Q&A round 2: battery thresholds, auto theme, shadow rule, 2D-with-soft-shading style confirmed. New 2D references (outlined chibi elephant, light pink + dark neon) → DESIGN_PROMPT.md rewritten with trunk/eye focus. Hoodie outfit added (mainly while coding).
- 2026-11-11 — Design delivered (manual export into `design/`). Reviewed: complete set — rig, turnaround, 15 expressions ×2 themes, hoodie (lilac/mint/peach + dark neon, hood up/down, pull-on), ~60 pose keyframes incl. coding w/ hoodie, charge/flex, window eat/push/sit. Pose sheet is parametric → chosen animation approach.
- 2026-11-11 — MVP step 1 built: Tauri scaffold, ported generator, animator/clips, behaviours, drag, tray, theme, persistence, browser preview.

## 7. Decisions & rationale
- Tauri first for dev speed; measure RAM/CPU; switch to native Rust/Win32 if too heavy.
- Reuse Claude Design's parametric generator at runtime instead of Rive/sprites: tiny, crisp at any size, poses tween smoothly, theme swap is free.
- Render only while a clip plays (rAF stops after); breathing = CSS transform on a wrapper (compositor, ~0 CPU). Walking moves the OS window via setPosition every 50 ms only while walking.
- Drag uses native `startDragging()`; "drop" detected as window stopped moving for 280 ms.
- Runtime crop `VIEWBOX = '0 -66 540 522'` of design canvas so the pet is ~96 px tall in a 120×116 window.
- Pet's basic life never depends on AI/network. AI local + on demand + permission-gated.
- Characters data-driven (art + trait config) so new animals reuse behaviours.
- "Push window" is fake: pet animates pushing, window never moves.
- Light hoodie default = lilac (configurable later). Dark headphones: optional, not in MVP.

## 8. Next steps / TODO
1. Owner tests `npm run app:dev`; measure idle CPU/RAM in Task Manager (targets: ~0% CPU idle, RAM as low as WebView2 allows).
2. Click-through on transparent pixels (toggle `setIgnoreCursorEvents` by hit-testing) so the window box doesn't block clicks.
3. Walk along taskbar / screen bottom (snap y to work-area bottom), screen-edge awareness.
4. Battery reactions (low ≤30% tired + "charge me pls", charger plugged → bounce+run, ≥90% flex + "unplug me" ×3) — needs Rust battery query.
5. Coding + hoodie clip, push-ups/skipping, trip-over-trunk, speech bubbles (generator has `bubble` prop).
6. Settings window (name, size S/M/L/custom, thresholds, sleep schedule, theme, autostart) + autostart plugin.
7. Window awareness: peek / eat / push (fake) / sit on top of windows; active app name → app-triggered reactions (later phase).

## 9. Open questions / blockers
- Smart App Control blocks Rust builds (see status). Owner decision needed.
- Owner to report how Dumbo looks/feels on the real desktop (agent can't screenshot WebView2 windows).
- RAM ~240 MB with WebView2: acceptable, or move to native Rust/Win32 renderer?
