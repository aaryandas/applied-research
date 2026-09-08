# Working MVP

The founder redirected the September 7 presearch to implementation: “we can do hardening later, lets get mvp done”, then explicitly selected OpenRouter. This authorizes the first working goal → learning activity → saved work loop. It defers the proposed durable-task recovery work; it does not accept that proposal or change the previously agreed product requirements.

## Implemented experience

The interface follows Field Atlas: the approved apple-landscape opening and centered prompt, shared day/evening tokens and local font definitions, the arch mark, opaque workspace surfaces, warm margins for human writing and a blue sans-serif inset for AI assistance. The goal form and provider preferences use native dialogs. See [the design contract](design.md) for visual authority and the distinction between working app flows and historical specimens.

- Create a learning space for any topic. With a configured provider, request a practical first step; without one, start writing and experimenting locally.
- Add and edit notes, insights, results and source references on a movable canvas. User writing is distinct from AI entries. Notes autosave after 350 ms without input, with visible pending/error status.
- Ask questions, request a hint or a worked example, and save the tutor's response as an attributed entry with navigable source annotations.
- Open an HTTPS source or tool in an isolated embedded view, or open it in the external browser. Cookies belong to its separate persistent guest session. Downloads, permission requests and popups are denied; incompatible authentication/tool flows use the explicit external fallback.
- Include current page text in an ordinary question, or start a guided activity. During guidance, a settled navigation can trigger a cue, with a 15-second minimum interval and one outstanding request. Stop disables further cues and cancels the local request. Ordinary pointer movement does not capture page content. The visual companion follows the cursor over the owned interface; it does not overlay the native guest view.
- Explore one reusable mathematical capability: a 2×2 linear transformation of a square/vector. Capture coefficients and computed results in an editable result entry. Slider state itself is transient until captured. No generated code executes.

The first MVP represents learning steps as source-linked AI entries rather than a separate structured curriculum/path editor. Arbitrary-topic entry is supported; equal evidence quality across topics is not established. Web citation metadata is validated as data and displayed with attribution. Claim-by-claim faithfulness is not automatically proven. Responses without usable citation annotations are replaced with an explicit support gap.

## Implementation choices for this pass

Retain the installed Electron/React/TypeScript/npm toolchain. These are implementation choices for the MVP, not a claim that every historical stack decision has been reaffirmed. No dependencies were added. Node 24 is used for development checks.

Use `node:sqlite` through a focused workspace store. Each project is a JSON document in one SQLite row; an entry update commits the current project document. WAL and FULL synchronous mode support ordinary local saves. This is ordinary current-state persistence, not event sourcing, multi-device sync or a durable task engine. The in-memory request controller is intentionally interrupted by app/process exit; no remote outcome recovery or automatic retry is implemented.

OpenRouter is the selected first integration. The initial configurable model is `openai/gpt-5.4-mini`, chosen for a bounded initial pass, not from a completed model evaluation. The main process calls Chat Completions and the beta `openrouter:web_search` server tool. Requests cap searches/tool steps at two and output at 3,000 tokens; a 90-second network deadline bounds the local wait. The 20-second useful-step goal remains an unverified target, not a measured guarantee. No 1,000-user capacity test has run.

Context consists of the goal, bounded recent saved entries and optional current-page text. OpenRouter and its selected model/search providers receive this data. Credentials remain in main; the renderer receives only connection status and the model ID. Native key-file import stores the key using Electron safeStorage. An unavailable OS encryption backend is not replaced with plaintext key storage.

## Running and connecting

Use Node 24 and `npm run dev`. Configure `OPENROUTER_API_KEY` in the launch environment, or use **Connect OpenRouter → Import OpenRouter key file** and choose a small text file containing the key or `OPENROUTER_API_KEY=…`. Do not put real keys in the repository, fixtures or a Vite-prefixed variable. The settings panel changes the OpenRouter model ID; `OPENROUTER_MODEL` overrides it at startup.

Development work is stored under the platform's application-data directory in **Applied Research Development**, using `workspace.sqlite`. Packaged applications use their normal Electron user-data directory. `APPLIED_RESEARCH_DATA_DIR` allows an explicit separate directory for local testing. Tests use temporary directories and recorded responses rather than real user data or paid API calls.

## Checks and deferred work

`npm run check` retains formatting, lint, strict types and the existing 90% unit-coverage gates. `npm run test:e2e` exercises SQLite persistence across real Electron restarts, renderer isolation, the isolated guest and a recorded OpenRouter round trip. A recorded response validates the integration shape, not live provider availability, citation faithfulness or latency. Live OpenRouter testing needs a configured key.

Deferred: durable background jobs/reconciliation, power-loss and device-loss recovery, backup/sync, comprehensive content verification/evals, hosted scale testing, Manim/Three.js runtimes, voice, automated clicking/typing, cursor overlays over native guests, advanced ingestion, packaging/signing and deployment. Existing desktop isolation and basic save/validation checks remain enabled. No cloud service, CI workflow, license or distribution setting changed.

Primary implementation references, checked September 7, 2026: [OpenRouter Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion), [OpenRouter web search](https://openrouter.ai/docs/guides/features/server-tools/web-search), [model listing](https://openrouter.ai/openai/gpt-5.4-mini), [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html). Current API/server-tool behavior still requires a live smoke test against the user's account.
