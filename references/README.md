# References — the reference bar for the gauntlet loop

Every entry is a **named, fetchable, comparable** bar. The critic compares the built surface
side by side with the asset here, blind. Status: `approved` (Aaryan said yes), `candidate`
(proposed, awaiting approval), `rejected`.

Each entry says **what it is a bar for**. A bar is never "make it look like X"; it is
"match X on this specific quality."

## Approved

| Reference | Bar for | Assets | Notes |
|---|---|---|---|
| World Labs site (worldlabs.ai) | Visual world: first viewport, editorial serif + grotesk pairing, engraved illustration beside type, restraint | `visual-world/world-labs/hero-1440x900.png`, `about-full.png`, `blog-hero.png`, `marble-hero.png`, source imagery `home-about.png`, `marble-*-bg.jpg`, `atlas-card.jpg` | Live type facts: display serif "Gilda Display" 80px/80px, tracking −4px; body "Roobert"; ground #f9f9fb, ink #2e2e38. Hero illustration is a WebGL canvas. Aaryan's original blue engraved-landscape screenshot is not in the repo yet: drop it in this folder. |
| Wabi iOS app (60fps.design/apps/wabi) | Motion: gesture-driven sheets, morphing transitions, animated cards, interruptible physics | `motion/wabi/*.mp4` (5 recordings) + `motion/wabi/frames/<name>/f-NNN.jpg` at 2 fps | intro-swipe-up (20 s), animated-app-icons (12 s), invite-code (4 s), chat-suggestion-carousel (13 s), app-detail-top-sheet-morph (11 s). |
| Jaimin (@jaimintf) Fable 5.1 vs GPT-6 Astra onboarding, built with Appllama skills + `/goal` | Motion and onboarding feel produced by an agent loop: the bar the loop itself should clear | `motion/wabi-style/jaimintf-appllama-goal-2880x2160.mp4` (15 s) + `frames/` | Source: x.com/jaimintf/status/2095896717225087132. Appllama skills are mobile-only (Expo/RN); the *method* (full-motion simulator loop, anti-slop bar) transfers, the skill does not. |
| 3Blue1Brown scene code (github.com/3b1b/videos) | Explainers: short single-concept animated explanations (a transformation, a derivative, a vector), not long videos | link only for now | manimgl, not manim community. License CC BY-NC-SA 4.0 on the scenes: style reference only, code cannot ship in a commercial product. Our explainers must be seconds long, one concept each. |
| Wondering canvas (Aaryan's screenshot) | Canvas: branching question→answer cards, notes as leaves, organic connectors, one prompt bar | `canvas/wondering-branching-canvas.png` | The spec for the Canvas surface. |
| Wondering learning map (Aaryan's screenshot) | Learning Path: a tree of subject → topics → lessons with per-lesson status (not started / completed / mastered), a detail panel listing the selected node's lessons, zoom controls | `canvas/wondering-learning-map.png` | Added 2026-09-06. The model for the Learning Path that replaces the Map. |
| Codex desktop app (OpenAI) | App chrome: multi-thread management, quiet chrome, running-task state, settings | Captured: `chrome/codex-desktop/empty.png`, `chrome/codex-desktop/settings.png`, `chrome/codex-desktop/long-list.png`. Still missing: `chrome/codex-desktop/running-task.png`. | Aaryan supplied whole-window PNGs on 2026-09-06: empty/list 2280×1447 px, Appearance settings 2261×1453 px; originals preserved without scaling. Theme: System, displaying Codex dark. UI and code fonts: “System default”, Regular; content: “Same as UI font”, Regular (concrete font families not exposed in this view). App version awaits confirmation. Empty state is the `test` project with “No chats”; other projects remain in the global sidebar. Long list shows expanded project task lists. See ticket 06. |
| Linear desktop (linear.app) | App chrome: keyboard-first desktop shell, command menu, list density, dark product UI | `chrome/linear/` | Inter Variable + Berkeley Mono. |
| Raycast (raycast.com) | Command palette and preferences design; bar for ⌘K finder and Settings | `chrome/raycast/` | |
| Arc browser (arc.net) | Sidebar-first shell, spaces, split views; bar for rails and layers | `chrome/arc/` | |
| arXiv HTML (arxiv.org/html/1706.03762v7) | Reading: structure fidelity of a reflowed paper (sections, MathML, cite links). Not an aesthetic bar. | `reading/arxiv-html/` | |
| Readwise Reader (readwise.io/read) | Reading: keyboard-driven reflow reader, highlights, inline AI, **vim-like navigation** (j/k and friends, ? for the map) | `reading/readwise-reader/` | Requirement recorded: vim-style keyboard navigation for the whole reading experience. |
| iA Writer (ia.net/writer) | Reading: typographic restraint and measure | `reading/ia-writer/` | |
| Semantic Reader (semanticscholar.org) | Reading: citation cards and term definitions in context | `reading/semantic-reader/` | Overlays PDFs; bar for in-context explanation only. |
| tldraw (tldraw.com) | Canvas: pan, zoom, selection, handles feel; likely implementation base | `canvas/tldraw/` | |
| Heptabase (heptabase.com) | Canvas: cards from notes on a whiteboard with backlinks | `canvas/heptabase/` | |
| Bartosz Ciechanowski (ciechanow.ski/mechanical-watch) | Explainers: interactive, scrubbable 3D mechanism explanations | `explainers/ciechanowski/` | |
| Distill.pub (distill.pub/2020/growing-ca) | Explainers: interactive diagrams inline in prose | `explainers/distill/` | |
| Sonner + Vaul + emilkowal.ski | Motion: web-native toasts, drawers, exact easing; the bar for motion inside a Chromium renderer | `motion/sonner/`, `motion/vaul/`, `motion/emil-kowalski/` | Pairs with the emil-design-eng skill. |
| Rauno Freiberg (rauno.me, ui.land) | Motion: hover, focus, transition craft in chrome | `motion/rauno/`, `motion/ui-land/` | |
| Amie (amie.so) | Motion: delight without noise on desktop | `motion/amie/` | |
| Appllama (appllama.io) | Motion: library of top-grossing mobile app patterns and recordings | `motion/appllama/` | Mobile-only skill; motion examples transfer, screens do not. |
| HeyClicky / clicky | AI interface: point-and-talk assistant, pointer swoops to the target | `pointing/heyclicky/` + `pointing/heyclicky/openclicky-src/` (the jasonkneen/openclicky fork); upstream source github.com/farzaa/clicky (Swift, the pointing motion and point-tag protocol); findings in `docs/research/pointing-protocol.md` | |
| Cursor (cursor.com) | AI interface: inline suggestions with accept/reject that never take over the surface | `pointing/cursor/` | |
| Dia browser (diabrowser.com) | AI interface: assistance beside a reading surface | `pointing/dia/` | |
| Wabi website (wabi.app) | Visual world: landing that matches product motion | `visual-world/wabi-site/` | |
| Cosmos (cosmos.so) | Visual world: editorial, image-led restraint | `visual-world/cosmos/` | cosmosOracle 74px/74px, weight 350, tracking −3.7px. |
| Linear homepage | Visual world: dark product-led landing with precise type | `visual-world/linear-home/` | |

## Rejected

Family (wallet app and site), Muse, Kosmik, Explorable Explanations, Claude Code desktop app, Cursor (as chrome), Raycast (kept). Rejected means not a bar, not a judgment.

## Capture conventions

- Web: `browse` at 1440×900, first viewport clipped + full page. Note computed fonts and colors.
- Video: keep the mp4 and a 2 fps JPEG frame sequence at 720 px so the critic can scrub without a player.
- Desktop apps: PNG at native scale, state named in the filename (`empty.png`, `loading.png`, `settings.png`).
- Every asset stays here for comparison only; nothing is redistributed.
