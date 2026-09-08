# Working MVP

The founder redirected the September 7 presearch to implementation: “we can do hardening later, lets get mvp done”, then explicitly selected OpenRouter. This authorizes the first working goal → learning activity → saved work loop. It defers the proposed durable-task recovery work; it does not accept that proposal or change the previously agreed product requirements.

## Assembled workspace — September 8

The shell-wiring integration replaces the MVP entry-card screen with Opening → Reader and a persistent topic sidebar. Reader, Distilled/Expanded Canvas, Practical Work and account Settings consume the existing component contracts. Canvas automatically uses an icon rail and thin top bar. Pasted sources, exact highlights, human notes/questions/insights and Canvas positions use named durable learning-record operations; Find searches saved local sources and writing. Appearance is shared across Opening and Settings, with dark as the default and the existing stored Light/Dark choice respected.

Reader also exposes the existing assembly and arm illustrations as explicit session-local examples. They have no inferred source attachment. Practical Work resolves the selected lesson's retained path revision; no selected activity yields its empty state. Its durable result operation is not yet declared/exposed, so edits remain explicitly unsaved and prevent navigation or ordinary window close until the missing producer is integrated. No legacy-entry save fallback or new IPC foundation is introduced.

The shell flushes component drafts/placements for navigation, project changes, Save work / Cmd/Ctrl+S and ordinary window close. Force quit/crash recovery remains outside this barrier. Account Settings uses the reviewed sign-in/cancel/sign-out/status/event operations; the historical provider-key importer and MVP companion/tool controls below are no longer exposed in this shell. Live AI curriculum/tutor composition and durable practical-result persistence remain coordinator work. The sections below preserve the historical MVP scope and setup, not the current navigation contract.

## Implemented experience

The interface follows Field Atlas: the approved apple-landscape opening and centered prompt, shared day/evening tokens and local font definitions, the arch mark, opaque workspace surfaces, warm margins for human writing and a blue sans-serif inset for AI assistance. The goal form and provider preferences use native dialogs. See [the design contract](design.md) for visual authority and the distinction between working app flows and historical specimens.

- Create a learning space for any topic. With a configured provider, request a practical first step; without one, start writing and experimenting locally.
- Add and edit notes, insights, results and source references on a movable canvas. User writing is distinct from AI entries. Notes autosave after 350 ms without input, with visible pending/error status.
- Ask questions, request a hint or a worked example, and save the tutor's response as an attributed entry with navigable source annotations.
- Open an HTTPS source or tool in an isolated embedded view, or open it in the external browser. Cookies belong to its separate persistent guest session. Downloads, permission requests and popups are denied; incompatible authentication/tool flows use the explicit external fallback.
- Include current page text in an ordinary question, or start a guided activity. During guidance, a settled navigation can trigger a cue, with a 15-second minimum interval and one outstanding request. Stop disables further cues and cancels the local request. Ordinary pointer movement does not capture page content. The visual companion follows the cursor over the owned interface; it does not overlay the native guest view.
- Explore the original MVP mathematical capability: a 2×2 linear transformation of a square/vector. Capture coefficients and computed results in an editable result entry. Slider state itself is transient until captured. No generated code executes.

The first MVP represents learning steps as source-linked AI entries rather than a separate structured curriculum/path editor. Arbitrary-topic entry is supported; equal evidence quality across topics is not established. Web citation metadata is validated as data and displayed with attribution. Claim-by-claim faithfulness is not automatically proven. Responses without usable citation annotations are replaced with an explicit support gap.

## Reviewed local-scene extension — September 8

The existing ToolPanel now offers an original selectable/explodable assembly and a two-link planar arm with bounded editable parameters and measured endpoint capture. Open an HTTPS tool in the workspace, then select Launch assembly or Launch arm. Keyboard orbit/zoom/reset, draft-safe numeric typing, context-loss/unavailable-WebGL fallback, demand rendering and ordinary app-switch camera preservation are implemented. Captures are explicitly session-only and retain app-measured attribution; persisted attachments, direct Practical Work entry, Reader/Canvas linkage and export remain unfinished. This extension is a bounded implementation, not whole AR-24 or full-app completion.

## Implementation choices for this pass

Retain the installed Electron/React/TypeScript/npm toolchain. Node 24 runs development checks. The reviewed scene slice adds Three.js 0.185.1 and React Three Fiber 9.7.0 with recorded MIT notices; the local persistence slice adds the pinned Drizzle and better-sqlite3 dependencies below.

Use Drizzle ORM 0.45.2 with better-sqlite3 12.11.1 (the supported Better Auth 1.7.3 peer family; see credential integration evidence) through a focused workspace store. Projects, entries, current revision pointers, immutable meaningful content revisions and canvas placements are normalized locally. WAL and FULL synchronous mode support ordinary local saves. Existing `node:sqlite` project-document databases are fully validated before change, copied to a verified WAL-consistent backup, and migrated transactionally while retaining the original JSON table. Valid legacy citation arrays retain their original order; ordering is not a corruption criterion. Corrupt, unsupported or newer data is refused without reset. A corrupt normalized project does not hide readable projects: the store returns structured unreadable-project identifiers and safe reasons for main-process diagnostics while the compatibility bridge still returns the readable project list. This is revisioned current-state persistence, not a universal event log, multi-device sync or a durable task engine. The in-memory request controller is intentionally interrupted by app/process exit; no remote outcome recovery or automatic retry is implemented.

OpenRouter is the selected first integration. The initial configurable model is `openai/gpt-5.4-mini`, chosen for a bounded initial pass, not from a completed model evaluation. The main process calls Chat Completions and the beta `openrouter:web_search` server tool. Requests cap searches/tool steps at two and output at 3,000 tokens; a 90-second network deadline bounds the local wait. The 20-second useful-step goal remains an unverified target, not a measured guarantee. No 1,000-user capacity test has run.

Context consists of the goal, bounded recent saved entries and optional current-page text. OpenRouter and its selected model/search providers receive this data. Credentials remain in main; the renderer receives only connection status and the model ID. Native key-file import stores the key using Electron safeStorage. An unavailable OS encryption backend is not replaced with plaintext key storage.

## Running and connecting

**Production replacement required:** [AR-12](credentials.md) selects app-managed AI through our backend. The direct key/environment/import setup below describes the existing development MVP only; it is not the approved shipped onboarding experience.

Use Node 24 and `npm run dev`. Configure `OPENROUTER_API_KEY` in the launch environment, or use **Connect OpenRouter → Import OpenRouter key file** and choose a small text file containing the key or `OPENROUTER_API_KEY=…`. Do not put real keys in the repository, fixtures or a Vite-prefixed variable. The settings panel changes the OpenRouter model ID; `OPENROUTER_MODEL` overrides it at startup.

Development work is stored under the platform's application-data directory in **Applied Research Development**, using `workspace.sqlite`. Packaged applications use their normal Electron user-data directory. `APPLIED_RESEARCH_DATA_DIR` allows an explicit separate directory for local testing. Tests use temporary directories and recorded responses rather than real user data or paid API calls.

## Checks and deferred work

`npm run check` retains formatting, lint, strict types and the existing 90% unit-coverage gates. `npm run test:e2e` exercises SQLite persistence across real Electron restarts, renderer isolation, the isolated guest and a recorded OpenRouter round trip. A recorded response validates the integration shape, not live provider availability, citation faithfulness or latency. Live OpenRouter testing needs a configured key.

Outside the historical MVP, with full-app work tracked separately: durable background jobs/reconciliation, power-loss and device-loss recovery, general backup/restore and sync, comprehensive content verification/evals, hosted scale testing, Manim rendering/playback and durable Three.js integration, voice, automated clicking/typing, cursor overlays over native guests, advanced ingestion, signing and deployment. Existing desktop isolation and transaction-boundary save/validation checks remain enabled. Local packaging now includes reviewed SQLite migration assets and native-module rebuilding.

Primary implementation references, checked September 7, 2026: [OpenRouter Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion), [OpenRouter web search](https://openrouter.ai/docs/guides/features/server-tools/web-search), [model listing](https://openrouter.ai/openai/gpt-5.4-mini), [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html). Current API/server-tool behavior still requires a live smoke test against the user's account.
