# How Clicky lets a model point (source read, 2026-09-05)

Scope: the pointing mechanism of Clicky (HeyClicky's open-source app, https://github.com/farzaa/clicky, MIT, HEAD `a80fa80` 2026-04-27), read from the Swift source. Question: what the model emits, how targets are identified, how the pointer moves, how speech and pointing interleave, what happens on a miss, and what transfers to a Chromium/React reading surface whose targets are sentence ids and named UI elements.

Sources used, in order of authority: `farzaa/clicky` (primary; paths below are relative to its root, `leanring-buddy/` is the app target). The heavier fork `jasonkneen/openclicky`, which is what the local checkout at `references/pointing/heyclicky/openclicky-src/` actually is, is used only in section (g) for the extensions it adds. (`references/README.md` says the source is at `references/pointing/openclicky-src/`; it is one level deeper, and it is the fork, not Farza's repo.) The HeyClicky site captures in `references/pointing/heyclicky/` are marketing only ("an ai buddy that lives on your mac", product video); no protocol is visible in them.

## (a) Architecture in one paragraph

Menu-bar app with two `NSPanel`s: a control panel and a full-screen transparent overlay per display. Push-to-talk audio streams to AssemblyAI; the transcript plus one JPEG per display goes to Claude over SSE; the reply is spoken through ElevenLabs. "Claude can embed `[POINT:x,y:label:screenN]` tags in its responses to make the cursor fly to specific UI elements across multiple monitors" (`README.md:140`). The overlay hosts a small blue triangle ("the buddy") that normally trails the real mouse pointer at `+35,+25` (`leanring-buddy/OverlayWindow.swift:441-444`). The real system pointer is never moved; the triangle is a separate view in an overlay window. Pointing is a screenshot-pixel → screen-point → overlay-flight pipeline with no accessibility tree, element ids, or OCR anywhere in the model's path.

## (b) The point-tag protocol

One tag, appended last, after the spoken sentence (`leanring-buddy/CompanionManager.swift:562-576`):

| Tag | Grammar | Meaning |
|---|---|---|
| `[POINT:x,y:label]` | integer screenshot pixels, top-left origin; `label` = "short 1-3 word description of the element" | fly the triangle to the point |
| `[POINT:x,y:label:screenN]` | plus 1-based screen index from the image label | same, on another display |
| `[POINT:none]` | literal | no pointing |

Prompt text that defines it (`CompanionManager.swift:562-570`): "when you point, append a coordinate tag at the very end of your response, AFTER your spoken text. the screenshot images are labeled with their pixel dimensions. use those dimensions as the coordinate space. the origin (0,0) is the top-left corner of the image." Then: "if the element is on a DIFFERENT screen, append :screenN ... without the screen number, the cursor will point at the wrong place." and "if pointing wouldn't help, append [POINT:none]." Worked examples (lines 572-576): `"see that source control menu up top? click that and hit commit, or you can use command option c as a shortcut. [POINT:285,11:source control]"`, `"that's over on your other monitor — see the terminal window? [POINT:400,300:terminal:screen2]"`, `"html stands for hypertext markup language... [POINT:none]"`.

The coordinate frame is supplied by appending `" (image dimensions: WxH pixels)"` to each image's label before the call (`CompanionManager.swift:601-606`); the cursor's display is labelled "primary focus" (line 559).

Parser (`CompanionManager.swift:782-828`): one regex anchored to end of text, `\[POINT:(?:none|(\d+)\s*,\s*(\d+)(?::([^\]:\s][^\]:]*?))?(?::screen(\d+))?)\]\s*$` (line 786). Output is `PointingParseResult { spokenText, coordinate?, elementLabel?, screenNumber? }` (lines 771-780); `spokenText` is the response with the tag cut off and trimmed (line 796). `[POINT:none]` yields `coordinate: nil, elementLabel: "none"` (line 806). A tag anywhere but the end is not matched and would be spoken verbatim; the repo has no tests for the parser (`leanring-buddyTests/leanring_buddyTests.swift` is the Xcode stub).

The same tag doubles as the onboarding demo's format: a second prompt asks for "your comment [POINT:x,y:label]", restricted to the central 20-80% of the image, and the model's 3-6 word comment becomes the bubble text (`CompanionManager.swift:949-965, 1015-1018`).

Pointing bias: this repo tells the model to "err on the side of pointing rather than not pointing, because it makes your help way more useful and concrete" (line 563), with the exclusions "general knowledge question", "nothing to do with what's on screen", "something obvious they're already looking at" (line 565).

## (c) How targets are identified

Visually, by the language model, in screenshot pixel space. There is no second opinion.

1. Claude, with the labelled screenshots in context, picks `x,y` by looking. Nothing verifies the pick.
2. Mapping (`CompanionManager.swift:636-680`): choose the capture (`:screenN` if given and in range, else the capture flagged `isCursorScreen`), clamp to screenshot bounds, scale pixels → display points, flip Y (top-left → AppKit bottom-left), add the display's global origin. Set `detectedElementScreenLocation`; the overlay reacts.
3. `leanring-buddy/ElementLocationDetector.swift` is a complete alternative resolver using the Anthropic Computer Use tool (`computer_20251124`, beta header `computer-use-2025-11-24`, screenshot resized to 1024x768 / 1280x800 / 1366x768 by aspect ratio, coordinate read from the `tool_use` block's `input.coordinate`, text reply "no specific element" treated as none; lines 33-34, 163, 174, 182, 236-262). It is not referenced anywhere else in the target (grep over `leanring-buddy/*.swift` finds no caller), so in this repo it is dead code, kept as the more accurate path the author tried.
4. `accessibility` in `CompanionManager.swift` refers only to the TCC permission check (lines 94-100, 301-334, 415); `AXUIElement` is used in `WindowPositionManager.swift` for window placement, never for targets.

## (d) How the pointer moves

All in `leanring-buddy/OverlayWindow.swift`.

- Trigger: `onChange(of: companionManager.detectedElementScreenLocation)` (line 371); only the overlay whose screen contains the target display's centre animates (lines 380-385), and other screens hide their triangle while one is navigating so only one buddy is visible (lines 396-406).
- Landing offset: `+8 px right, +12 px down` "so the buddy sits beside the element rather than directly on top of it", then clamped 20 px inside the screen (lines 466-476).
- Path: quadratic Bezier from the current position. Control point = midpoint raised by `arcHeight = min(0.2 * distance, 80) px` (lines 515-522), so the arc is a shallow parabola that flattens on long trips.
- Easing: linear frame progress `t_lin` passed through smoothstep `t = 3t² - 2t³` before evaluating `B(t)` (lines 539-549). No anticipation, no overshoot, no spring on arrival.
- Duration: `min(max(distance / 800, 0.6), 1.4)` seconds (line 510); a 60 fps `Timer` writes `cursorPosition` directly with implicit SwiftUI animation disabled during flight (lines 303-306, 511-513, 551).
- Body language: rotation = curve tangent `atan2(B'(t)) + 90°` (lines 553-561); scale `1 + 0.3 · sin(π · t_lin)`, peaking ~1.3x at the apex (lines 563-566); glow radius `8 + (scale - 1) · 20` (line 309).
- Arrival: rotation snaps back to the resting `-35°` "cursor-like" angle (lines 138-140, 576); the bubble scales in from 0.5 with `spring(response 0.4, damping 0.6)` (line 290) and types one character per 30-60 ms (lines 606-631). Text is `detectedElementBubbleText` if the manager set one (only the onboarding demo does) else a random phrase from `["right here!", "this one!", "over here!", "click this!", "here it is!", "found it!"]` (lines 175-182, 586-588). The model's `label` is logged and sent to analytics but never displayed (`CompanionManager.swift:678-679`).
- Dwell and return: hold 3.0 s after the last character, fade the bubble over 0.5 s, then fly back along the same Bezier to the live mouse position `+35,+25`, and clear the target (lines 590-602, 634-646, 660-672).
- Interruption: the outbound flight and the dwell ignore mouse movement; only the return flight is cancelled, and only if the mouse has moved >100 px from where it was when the flight started (lines 415-428, 649-657).
- Following mode, for contrast: `spring(response 0.2, damping 0.6)` on position (line 210, 315), sampled at 16 ms (line 410). No reduce-motion handling anywhere in this file.

## (e) What is said vs shown; how they interleave

- The model writes one utterance for the ear ("write for the ear, not the eye. short sentences. no lists"; `CompanionManager.swift:549-551`) and puts the target only in the tag. Nothing in the prompt forbids saying coordinates, but the examples never do, and the tag is stripped before TTS.
- No streaming display: `onTextChunk` is a no-op ("spinner stays until TTS plays", lines 618-620). The full response is awaited, parsed, the tag stripped (lines 625-627).
- Order of events (lines 632-706): if there is a coordinate, `voiceState = .idle` so the triangle is visible, then `detectedElementScreenLocation` is set, which starts the flight immediately. Then `elevenLabsTTSClient.speakText(spokenText)` is awaited; it fetches the whole clip and calls `player.play()` (`ElevenLabsTTSClient.swift:50-67`), so speech starts one TTS round-trip after the flight begins. Flight (0.6-1.4 s), bubble typing and the 3 s dwell then run concurrently with the audio.
- The bubble and the speech carry different content: speech is the answer, the bubble is a generic "right here!" style interjection (the label is not shown).
- Conversation history stores `spokenText`, the stripped text, "so it doesn't confuse future context", capped at 10 exchanges (lines 690-698).
- In transient mode (user hid the cursor) the overlay waits for TTS to stop and for the pointing round-trip to finish (`detectedElementScreenLocation == nil`), pauses 1 s, then fades out (lines 733-756).

## (f) When a target cannot be found

1. The model's only escape is `[POINT:none]`; the app then prints "no element" and does nothing visual (lines 681-683). Speech proceeds normally. There is no retry, no fallback resolver in the live path, and no "I can't see it" message.
2. A missing or malformed tag is not an error: the regex simply does not match, `coordinate` is nil, and whatever the model wrote is spoken as is (lines 788-792).
3. A bad `screenN` (out of range) falls back to the cursor's screen (lines 636-642). Out-of-range coordinates are clamped to the screenshot, never rejected (lines 655-657).
4. A wrong point is not detectable by the app; the user sees the triangle land on the wrong thing and asks again. There is no correction loop.
5. `ElementLocationDetector` would have provided a "no specific element" text path (its prompt, line 174) but it is unwired.

## (g) What the jasonkneen/openclicky fork adds (local checkout)

Same protocol and same flight code, plus, with paths under `references/pointing/heyclicky/openclicky-src/`:
- `[RECT:x,y,w,h:label]` and `[SCRIBBLE:x1,y1;x2,y2;...:label]` overlays, one tag max per reply, 6 s default lifetime (`cursor-buddy/CompanionManager+PointTagParsing.swift:120-181`, `cursor-buddy/CompanionManager.swift:15807-15813`).
- Sentence-streamed TTS with a guard that strips a trailing half-arrived tag (`[POI`, `[RECT:10,20`) so it is never voiced (`CompanionManager+PointTagParsing.swift:39-57`, tests at `cursor-buddyTests/OpenClickyVisualGuidanceOverlayTests.swift:150-153`).
- The relevance gate flipped: "do not point at generic, nearby, decorative, stale, or merely available UI... if you're unsure, do not guess" (`CompanionManager.swift:15801-15803`), versus Farza's "err on the side of pointing".
- The Computer Use detector wired in as a second pass when the model says none and the transcript contains screen words ("button", "menu", "where", "how do i"...) (`cursor-buddy/CompanionManager+AIResponsePipeline.swift:1698-1760`).
- Bubble shows `"right here: <label>"` (`CompanionManager+AIResponsePipeline.swift:1759-1765`); last pointed location is remembered 120 s so "click that / this one" resolves to it (`CompanionManager.swift:2439-2444, 7754-7757`).
- Per-display calibration offsets learned from "is THIS the Xcode icon?" turns (`CompanionManager.swift:15799, 15943-15955`); a local HTTP/MCP bridge `POST /cursor {x,y,caption,durationMs,mode,travelDuration}` (`cursor-buddy/OpenClickyExternalControlBridge.swift:254-262, 596-607`); reduce-motion honoured for overlays only (`OverlayWindow.swift:1031, 1070`).

## (h) What transfers to a Chromium/React reading surface

Targets there are sentence ids (`data-sid`) and named UI elements; geometry is free (`getBoundingClientRect`); there is no real pointer to return to.

| Mechanism | Transfers? | How |
|---|---|---|
| One trailing control tag, regex anchored at end, stripped from spoken/displayed text, `none` literal | Yes | Keep the grammar, change the payload: `[POINT:s-142:the lemma]`, `[POINT:ui:search:search box]`, `[POINT:none]`. |
| Screenshot-pixel coordinates, image-dimension labels, `:screenN`, Y-flip, clamp | No | Resolve the id in the DOM; the whole coordinate pipeline and the fork's calibration mode disappear. A pane id could replace `:screenN` if the reader has several panes. |
| Model picks target by looking at pixels; Computer Use detector as fallback | No | The model names an id or label it was given in context (sentence ids in the prompt, element names in a manifest); fallback is fuzzy text match against sentence text and `aria-label`s, still returning none on low confidence. |
| Farza's "err on the side of pointing" vs the fork's "do not guess" | Both, as a knob | For a reading tool, point liberally at sentences (cheap, reversible) and conservatively at UI elements (the fork's gate wording). |
| Quadratic Bezier arc, `arcHeight = min(0.2d, 80)`, smoothstep, duration `clamp(d/800, 0.6, 1.4)` s at 60 fps | Yes | `requestAnimationFrame` or Web Animations with a manual path; same constants are a sound start. |
| Scale pulse 1.3x at apex, tangent rotation, glow | Optional | Fine for a glyph cursor; drop if the pointer is an underline or bracket. |
| Land beside the target (+8,+12), clamp inside the viewport | Yes | Anchor to the sentence rect's leading edge. New requirement: `scrollIntoView` first, since Clicky never faces off-screen targets (the screenshot is the visible screen). |
| Bubble: spring pop-in, 30-60 ms per character, 3 s hold, 0.5 s fade | Yes | Same timings; show the label (the fork's `right here: <label>`), not a random phrase, and use it as the pointer's accessible name. |
| Flight starts when the full reply is parsed; speech starts one TTS round-trip later | Yes, but improve | Tag-last means pointing waits for the whole reply. On a DOM surface emit the tag first (`[POINT:s-142] ...`) and strip it the same way, so the pointer moves while the sentence is being spoken or typed. |
| Fly back to the real mouse pointer; hide other screens' buddies | No | No system pointer. Return to a home slot (assistant panel) or fade in place. Single surface, so no duplicate-buddy rule. |
| Outbound flight uninterruptible; return cancelled on >100 px mouse move | Yes, adapted | Cancel on user scroll or pointer move past a threshold; never cancel the outbound leg. |
| `none` → nothing shown, speech unchanged, no retry | Yes | Same. Add the fork's fallback resolver only if id misses turn out to be common. |
| Stripped text into history, capped | Yes | Same; ids are stable so they could stay in history too. |
| Streaming partial-tag guard (fork) | Yes, verbatim | Needed the moment text streams to the screen or to TTS. |
| `[RECT]` / `[SCRIBBLE]` (fork) | Partly | RECT becomes a sentence-range highlight `[HIGHLIGHT:s-140..s-143]`; SCRIBBLE has no reading-surface use. |
| Last-pointed referent for 120 s (fork) | Yes | Keep the last pointed sentence id as the referent for "explain that", "highlight this". |
| Reduce-motion | Add | Neither repo honours it for the flight; the web surface should. |

## Sources

- Clicky (primary): https://github.com/farzaa/clicky, MIT, HEAD a80fa80721a8aebe51a170a7780705024ebc6e46 (2026-04-27), cloned to scratchpad and read directly
  - `README.md:12, 140-150` — "It can see your screen, talk to you, and even point at stuff"; architecture and tag summary
  - `leanring-buddy/CompanionManager.swift:43, 284-287, 544-576, 584-720, 733-756, 771-828, 949-965, 985-1020` — system prompt, pipeline, mapping, TTS ordering, parser, onboarding demo
  - `leanring-buddy/OverlayWindow.swift:138-140, 175-182, 210, 290, 303-315, 371-406, 409-444, 461-566, 572-672` — trigger, tracking, flight, landing, bubble, return, cancel
  - `leanring-buddy/ElementLocationDetector.swift:33-34, 62, 163, 174, 182, 236-262` — unwired Computer Use resolver
  - `leanring-buddy/ElevenLabsTTSClient.swift:33-73` — fetch-then-play TTS
  - `leanring-buddyTests/leanring_buddyTests.swift` — no parser tests
- Fork (secondary, section g): https://github.com/jasonkneen/openclicky, HEAD e9eb06a (2026-09-02), local checkout `references/pointing/heyclicky/openclicky-src/`; files as cited inline
- HeyClicky site (marketing only): `references/pointing/heyclicky/full-page.png`, `facts.json` (https://www.heyclicky.com/)
