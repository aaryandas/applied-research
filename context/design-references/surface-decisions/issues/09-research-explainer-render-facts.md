# 09 · Research: explainer render facts (Manim service, R3F scene schema)
Type: research
Status: resolved
Blocked by: —

## Question
Product-facing facts only. (1) Rendering a 5 to 15 second Manim scene on a cloud service: realistic end-to-end latency, whether progressive preview or frame streaming is feasible, cold start, and the Manim community vs manimgl license position for a commercial product. (2) A constrained scene schema driven live by React Three Fiber: what primitives, animations, and scrub controls a JSON schema can express, and what a single-concept 3Blue1Brown-style transformation or Ciechanowski-style mechanism needs from it. (3) Any existing schema-to-scene systems worth knowing (first-party docs only).

## Output
`docs/research/explainer-render-facts.md`, with a short table: medium → latency → interactivity → what it is good for → what it cannot do.

## Answer
Findings: `docs/research/explainer-render-facts.md` (2026-09-05, primary sources; every latency figure marked estimate because no first-party source publishes one).

- **Two media, two natures.** A Manim clip is an *asset*: tens of seconds to arrive (estimated: preview quality 5 to 20 s, 1080p 20 to 90 s, plus 5 to 30 s cold start for a TeX container), then watched and seeked. A React Three Fiber scene from a schema is an *instrument*: first frame in tens of milliseconds, scrubbable, rotatable, parameters draggable. The Explainers surface must treat the wait as two different states, not one.
- **Progressive preview exists but is not streaming.** Manim writes one partial movie file per `play()` call and can dump a still (`-s`) fastest of all; an explainer can therefore show a still, then the finished clip, never a spinner. Live OpenGL preview needs a desktop window and is off when writing to file.
- **Licenses.** Manim Community and manimgl code are MIT. 3Blue1Brown's *scene* code is CC BY-NC-SA 4.0: style bar only, never copied. Theatre.js studio is AGPL; Remotion is free only for very small teams; three, R3F, drei, Motion Canvas are MIT.
- **R3F from JSON is one-to-one** (class name, args, props), and three's own AnimationClip/KeyframeTrack JSON with `mixer.setTime` under an on-demand frameloop gives deterministic scrubbing; labels via drei `Html` keep MathML selectable; grids and orbit camera exist off the shelf.
- **What a schema must have.** A 3Blue1Brown-style linear map needs one interpolated parameter plus tracking labels; a Ciechanowski-style gear train needs exposed scalars driving derived transforms, drag, and spring settle. So the schema's key feature is a closed expression whitelist over a few parameters, not keyframes alone. No existing schema-to-scene system covers both interaction and export; three's JSON scene format is complete but has no interaction; Manim has no scene JSON.
- **Consequence for the Explainers ticket.** Selection rule can be stated as: transformations and quantities → Manim clip (asset, cited, saved); mechanisms you should turn → R3F scene (instrument, cited, live). Building the R3F schema on AnimationClip JSON keeps the instrument exportable to video later.
