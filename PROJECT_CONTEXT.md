# PROJECT_CONTEXT — TinyVirtualCutie

## 1. Overview
Tiny on-screen desktop pet ("TinyCutie") for Windows. Lives on desktop by itself with a personality, does cute activities, reacts to user, later does small work on the computer. Personal use only (no store/signing/licensing needed).
- First character: **baby elephant, working name "Dumbo"** (name configurable). Later characters (owl, eagle, ...) reuse same features via per-character config.
- Art: soft 2D cartoon, chibi (big head, small body), dark clean outlines + soft shading, NOT pixel art, smooth animation. Two themes, same character: **Light** (lavender-grey body, pink inner ears/paw pads/blush, cream belly), **Dark "Neon"** (slate-navy body, purple inner ears, cyan→magenta neon rim glow, pink paw pads). Final reference images given in chat 2026-11-11 (not saved in repo; owner attaches them in Claude Design).

Source material: owner's handwritten notes (2026-11-11), `suggestions_idea.txt` (brainstorm), Q&A answers (2026-11-11, recorded below).

## 2. Tech stack & how to run
- **Electron 33 on the stock, unmodified runtime** (renamed `Dumbo.exe`) + Vite + TypeScript, no UI framework. Chosen because Windows Smart App Control (must stay ON per owner) blocks any freshly compiled/unsigned exe — Tauri/Rust builds were blocked. The stock Electron binary is already trusted, and our code is just JS/HTML it loads.
- Art: Claude Design generators run at runtime: `src/art/dumbo.js` (side-view poses) + `src/art/face.js` (3/4 head expressions) composed into a front-facing sitting Dumbo by `src/art/front.js`.
- State: `%APPDATA%\Dumbo\state.json` (settings + position), shared by dev and installed copies.
- Installed copy: `%LOCALAPPDATA%\Dumbountime\Dumbo.exe` + `%LOCALAPPDATA%\Dumbopp\`, shortcuts on Desktop + Start Menu. Start with Windows = HKCU Run entry via Electron login items.
- Commands: see `AGENTS.md` (`npm run dev`, `npm run install-app`, bench/snap tools).

## 3. Structure
- `electron/main.cjs` — host: transparent always-on-top click-through pet window (240×220 × size; pet drawn 120×116 bottom-centre, rest is room for bubbles/jumps), tray menu (show/hide, sleep, wake, theme, settings, start with Windows, quit), settings window, drag-follow-cursor, cursor tracking (4 Hz, only while facing you), battery presence check (WMI via powershell), state file, single instance. Dev-only env hooks: `DUMBO_DEV_URL`, `DUMBO_BENCH`, `DUMBO_FLAGS`, `DUMBO_OPAQUE`, `DUMBO_NOFWD`.
- `electron/preload.cjs` — narrow `window.host` bridge. `src/host.ts` — typed wrapper (+ no-op fallback for plain browser).
- `src/main.ts` — Dumbo's brain: modes front/side/sleep/held/busy; looks at you (gaze + head tilt + turns toward your side), blinks, idle expression changes, decisions (walk, ear flap, wave, coding in hoodie, push-ups, skipping rope, trip after walks), sleep (doze facing you or curl up; night schedule; sleepiness), click (laugh bounce / wake), drag (dangle, pouts if busy/asleep) + gravity fall to taskbar, petting (slow hover), tickling (fast rubbing), speech bubbles, battery reactions, settings live-apply, dev perf log + bench modes.
- `src/engine/animator.ts` — event-driven renderer with two views (side clips / front tweens), stops when idle. `src/engine/clips.ts` — side clips from design pose frames.
- `src/art/*` — generators (see above) + `.d.ts`. `src/settings.ts` + `settings.html` — settings page.
- `index.html` (pet page: bubble + stage), `preview.html` (browser animation tester), `vite.config.ts` (3 pages, `base: './'`).
- `scripts/dev.mjs`, `scripts/install.mjs`, `scripts/bench.sh`, `scripts/snap.cjs`. `assets/` icons.
- `design/Dumbo Desktop Pet Mascot/` — owner's Claude Design export (source art; don't edit).

## 4. Current status (2026-11-12)
- **Working & installed**: standalone Dumbo runs from Desktop/Start shortcut with Smart App Control ON (no blocks). Boot verified ("boot ok").
- Built: front-facing view that looks at you (eyes follow cursor, head tilts, turns to your side), 15 expressions, blinks, click-through on transparent pixels, drag + fall to taskbar, petting/tickling, speech bubbles, walking/running along the taskbar, coding in hoodie (hood up when focused), push-ups, skipping rope, tripping, flex "unplug me" (≤3 times), tired "charge me pls", charger-plugged excitement + run, sleep (doze/curl, night schedule), tray, settings window, start with Windows, themes.
- Perf (measured with perf counters, % of ONE core; machine has 22 threads): still/asleep ≈0.5%; awake & active ≈15–20% during the first busy minute (≈1% of whole CPU in Task Manager terms). Root cause: each drawn frame costs ~10–30 ms (SVG re-raster + window present), so no continuous animation (breathing removed) and low-fps clips. RAM ≈320 MB (GPU process ~180 MB). Earlier "0% CPU" Tauri numbers were a measurement bug.
- Not verified by agent: on-desktop look/feel (agent can't screenshot the pet window); battery reactions on real plug/unplug; start-with-Windows on real reboot.
- Not built yet: window awareness (peek/eat/fake-push/sit on windows), app-triggered reactions, coding sync with real editor activity, "let's stretch" nudge after long sessions, multi-monitor, AI.

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
- 2026-11-12 — Smart App Control blocked Tauri builds → moved host to stock Electron runtime + per-user install script (works with SAC on). Git repo created (owner: commit continuously). Front-facing "looks at you" view from the design's expression generator (no new art needed). Added click-through, gravity, battery reactions, coding/hoodie, exercises, trip, bubbles, settings window, autostart. Perf investigation: per-frame cost dominates → removed breathing, low-fps clips, saccade gaze.

## 7. Decisions & rationale
- Smart App Control stays ON (owner) → no compiled exe ever; Electron stock runtime + JS. Tauri removed (in git history: commit 49bfdb2).
- Reuse Claude Design's parametric generators at runtime instead of Rive/sprites: tiny, crisp at any size, poses tween, theme swap free, no new art for new behaviours.
- Home state = front 3/4 sitting view facing the user (owner wanted it to look at them); side view only for movement/actions.
- Every frame costs CPU → event-driven, no continuous animation, low fps (8–14), eye saccades; cursor polled at 4 Hz only while facing you.
- Click-through via `setIgnoreMouseEvents(true, {forward:true})` + per-pixel hit test of the SVG.
- Dropped mid-air → falls to the taskbar (gravity); walking is along the taskbar.
- Battery presence via WMI once at start; levels via `navigator.getBattery()`.
- "Push window" will be fake: pet animates pushing, window never moves.
- Light hoodie = lilac (design default). Dark headphones not used.

## 8. Next steps / TODO
1. Owner feedback on look/feel on the real desktop (size, pace, how often he naps, bubbles).
2. Perf phase 2 if needed: layered front view (static body/head layers, eyes/ears/blink via GPU transforms) to cut per-frame raster cost; consider fewer SVG blur filters while moving.
3. Window awareness: find window rects (Win32 via PowerShell/ffi-free approach) → peek / eat corner / fake push / sit on top of windows.
4. App-triggered reactions (configurable app → action mapping in settings) + coding sync (editor focused).
5. "Let's stretch" nudge after long active sessions.
6. Multi-monitor; more characters (owl, eagle) via data-driven art.

## 9. Open questions / blockers
- None blocking. Owner to judge cuteness/pace and acceptable CPU/RAM.
