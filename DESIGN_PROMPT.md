# Dumbo — Claude Design prompts

How to use: run these **in order** in Claude Design, one at a time. Attach both reference images (light pink elephant + dark neon elephant) to **every** prompt. Pick a favourite before moving on, and start each later prompt with "Keep the exact same Dumbo from before."

The two most important things: **the eyes** and **the trunk**. If either looks off, fix it in Prompt 1 before doing anything else.

---

## Prompt 1 — Character base (light + dark)

```
Design an original desktop-pet mascot: a tiny baby elephant named "Dumbo" (placeholder name).
It lives on a computer desktop as a small companion, shown at ~96px tall, so design it large and clean so it still reads when small.

Use the two attached images as close style inspiration (same vibe, not a copy):
- 2D cartoon sticker style: clean dark-plum outlines (not pure black), soft cel shading with gentle gradients, subtle highlights. NOT pixel art, NOT photoreal 3D.
- Chibi proportions: big round head (~55–60% of height), small round body, short stubby legs, oversized soft rounded ears, a tiny curl/tuft of hair on top of the head, a small tail with a little tuft.
- Paw pads visible on the soles of the feet (one big bean + three small toe beans), toenails as soft rounded bumps on the front.
- A soft belly patch.

EYES (very important — must be extremely cute):
- Large, glossy, slightly oval eyes set wide and low on the face (below the head's midline), leaning slightly toward the trunk side.
- Deep dark iris with a soft colour gradient (warm brown in light theme, deep violet in dark theme).
- Two highlights per eye: one big round sparkle top-left and one small dot bottom-right. Highlights consistent on both eyes.
- Thin, simple, expressive eyebrows floating above.
- Soft blush ovals on both cheeks with 2–3 tiny diagonal shine strokes.

TRUNK (very important — must look good and cute, focus here):
- Short and chubby, NOT long or realistic. About the length of one eye-width to 1.5 eye-widths.
- Starts wide at the face between/below the eyes, tapers smoothly and evenly, then curls gently UP at the tip into a small rounded end with a visible little nostril opening.
- Smooth single curve (like a soft "J"), no kinks, no wrinkles except 2–3 tiny faint lines near the base.
- Sits slightly to one side so the mouth stays visible underneath.
- Mouth: small open happy smile under the trunk with a tiny pink tongue.
- Trunk must read clearly in silhouette at 48px.

Themes (SAME silhouette and proportions; only colours/effects change):
- LIGHT: lavender-grey body, cream belly patch and toenails, soft pink inner ears, pink paw pads, pink blush, dark-plum outline.
- DARK "Neon": slate-navy body, lighter violet belly patch, glowing purple inner ears, pink paw pads, pink blush, dark outline with a neon rim glow along the outer silhouette that shifts from cyan (left/back) to magenta/violet (right/front). Glow is soft, not harsh.

Personality: really kind, gentle, a bit sleepy, innocent.
Transparent background. 3/4 front view, sitting pose (like the references).

Deliver: light and dark side by side, plus each scaled to 96px and 48px to check readability of eyes and trunk.
Also show 3 trunk variations (slightly shorter / current / slightly more curled) so I can pick.
```

---

## Prompt 2 — Hoodie outfit

```
Keep the exact same Dumbo (light and dark). Design a cute hoodie it wears, mainly while coding.

- Cozy oversized baby hoodie, a little too big (sleeves cover the front feet slightly, bunched cuffs).
- Front kangaroo pocket. Two drawstrings with round tips.
- Hood has two ear slots so the big ears poke out when the hood is up.
- Small cute chest emblem (simple: a tiny "{ }" or a tiny heart or a tiny peanut). Show 3 emblem options.
- Colours: LIGHT theme = soft pastel (show options: lilac, mint, peach). DARK theme = charcoal/black hoodie with thin neon cyan/magenta trim on cuffs, drawstrings and hood edge.

Show: hood DOWN (default) and hood UP (focused coding mode), sitting and standing, light and dark.
Hoodie must be built as separate layers (body, hood up, hood down, left sleeve, right sleeve, pocket, drawstrings) so it can go on/off and move with the rig.
Also 3 key frames of Dumbo pulling the hoodie on (head popping out of the neck hole, ears flopping out).
```

---

## Prompt 3 — Turnaround + layered parts (for animation rig)

```
Keep the exact same Dumbo (light and dark themes).

Make a turnaround: front, 3/4, side (facing right), back. Standing on four legs AND sitting.

Then produce a RIG-READY exploded view of the side-view and 3/4-view standing pose, with every part as a separate, cleanly separated SVG layer/group so it can be animated with a skeletal rig:
head, hair tuft, body, belly patch, left ear, right ear, trunk (3 segments: base, middle, curled tip — joints must overlap smoothly so it bends without gaps), left eye, right eye, eye highlights (separate), upper eyelids (closed state), eyebrows, mouth (separate), tongue, cheeks/blush, front-left leg, front-right leg, back-left leg, back-right leg, paw pads, tail, tail tuft, neon rim glow (dark theme, separate layer), ground shadow (soft oval, separate).
Hidden areas under overlapping parts must be painted in (e.g. full ear base under the head) so parts can rotate without gaps.
Name each layer clearly. Export as SVG.
```

---

## Prompt 4 — Expression sheet (face only)

```
Keep the exact same Dumbo face construction. Create an expression sheet, light theme first then dark theme, using only the face (eyes, eyelids, eyebrows, mouth, blush, ear angle, trunk curl). No floating symbols, no emoji, no sweat drops.

Expressions:
neutral idle, smile, happy, laugh (eyes closed ^ ^), excited (extra sparkly eyes), sad (teary-glossy eyes, trunk drooping), pout (puffed cheeks, looking away, trunk curled tight), confused (one eye squint, head tilt), thinking (eyes looking up, trunk tip touching chin), tired / low battery (droopy half-closed eyes, ears down), sleeping (eyes closed, calm), curious (wide eyes, ears forward, trunk raised), ticklish giggle, proud (for flexing muscles), focused coding face (slight determined brows).

Keep eyes cute in every expression — never scary or sharp.
Each expression = swap of separate eye / eyelid / brow / mouth layers on the same head so it can be switched in code.
```

---

## Prompt 5 — Key poses for actions

```
Keep the exact same Dumbo, light and dark themes. Draw key poses (2–4 key frames each, side view facing right unless noted):

1. Idle breathing (subtle), blinking
2. Sleeping curled up, plus "falls asleep" transition
3. Walking cycle (4 key frames)
4. Running cycle (4 key frames), ears flapping back
5. Sit down / stand up
6. Coding: wearing the hoodie (hood down, then hood up when focused), sitting at a tiny laptop, typing with front feet
7. Push-ups (up/down)
8. Skipping rope (jump up / land)
9. Ear flapping (happy)
10. Waving with trunk
11. Tripping over its own trunk (stumble, fall, sit up embarrassed)
12. Flexing muscles on back legs, tiny proud biceps, pointing at a charger plug — "unplug me, I'm full!"
13. Tired, slumped, holding a tiny charging plug — "charge me pls"
14. Excited bounce + running (charger connected)
15. Being dragged/held by the scruff: dangling legs, both a happy version and a pouting version
16. Being petted (eyes closed, happy lean) and tickled (giggling squirm)
17. Peeking curiously at something (leaning forward, ears up, trunk sniffing)
18. Trying to eat a window corner (trunk/mouth on the edge)
19. Pushing against a window with all its might and failing (straining, feet slipping)
20. Sitting on top of a window edge, legs dangling

Keep all poses built from the same layered parts as the rig sheet.
```

---

## Prompt 6 — Small UI bits (optional)

```
Keep the same Dumbo style. Design:
- A small rounded speech bubble (light + dark theme) for short cute lines like "hi!", "sleepy...", "charge me pls", "unplug me!".
- A tray icon: Dumbo's head, readable at 16px, 24px, 32px (light + dark).
- A tiny laptop prop (sticker on the lid) and a tiny charging plug prop matching the style.
```

---

## Hand-back checklist
- Final light + dark base character (PNG preview + SVG).
- Hoodie layers (Prompt 2).
- Layered SVG rig parts (Prompt 3) — most important for animation.
- Expression sheet + key poses (SVG preferred, PNG fine).
- Drop everything in a folder `design/` in this project.
