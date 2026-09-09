# Production credentials and AI access

Decision: **app-managed AI through our backend**, explicitly selected by the founder in [AR-12](https://linear.app/aaryan-das/issue/AR-12). This supersedes the MVP's user-imported OpenRouter key as the shipped onboarding path. OpenRouter remains the selected provider; Effect v3 is selected for the next backend work.

On 2026-09-08 UTC, the founder selected **Railway** and **Better Auth with GitHub sign-in**, replacing the proposed Auth0 option. Use the supported Electron integration with system-browser sign-in, validated callback/state handling and credentials confined to main-process secure storage. The session and monthly allowance policies below are approved. The server half of this boundary is implemented in the AR-12 backend slice; desktop integration, independent review, external callback configuration and deployed behavior still require evidence. Unrelated hosting upgrades or unbounded spend are not authorized. See AR-6 and AR-12 for the decision receipt.

## Accepted ownership

Users sign in to Applied Research. The desktop authenticates requests to our backend; the backend authorizes the user, enforces usage/spend policy and calls OpenRouter using a backend-only provider credential. Saved learning work remains locally owned and editable offline. The backend receives only the context needed for the requested AI operation, consistent with the accepted local-authority model.

Store the company provider key in supported managed secrets supplied to the backend runtime. Railway is the selected host; service-scoped runtime variables are the configured secret delivery mechanism, and they are not a mechanism for securely distributing a company key to installed Electron clients. Never bundle the provider key, a Railway token or infrastructure secret-manager credentials into desktop code, renderer variables or an installer.

The desktop may need user session credentials. Select a supported desktop sign-in/session mechanism and appropriate OS-backed storage for those credentials. That is distinct from storing the company's OpenRouter key. A credential-store primitive alone does not implement authentication, authorization, expiry, refresh, logout or revocation.

## Accepted session policy — September 8

The founder selected a US$20 per-user monthly AI allowance with no daily limit and prefers Gemini 3.8 Flash. Use explicit OpenRouter model `google/gemini-3.8-flash`, verified in its official catalog, with a UTC calendar-month usage ledger. Outstanding reservations count against the remaining allowance; numerical input/output bounds and verified model pricing bound request admission. The US$2 total / 10-request synthetic live-test ceiling remains separate. The founder subsequently authorized Railway project creation and proceeding with the backend setup; infrastructure access and actual deployment evidence must still be recorded, never inferred from configuration alone.

The founder approved Better Auth's seven-day rolling session, renewed after one day. Every paid AI request must validate the authoritative database session; a cached cookie alone cannot authorize spending. Online sign-out revokes the session. Desktop sign-out clears local credentials immediately, including offline, while preserving editable saved learning work. Offline sign-out cannot guarantee remote revocation until the service is reachable. Session expiry or revocation requires sign-in for remote AI, never for local work.

This resolves the session-policy decision in AR-12. The founder subsequently authorized Railway project creation and backend setup and delegated routine remaining engineering decisions. Owned callback/domain identifiers and working external account/backend configuration still require actual setup and verification. The accepted policy is not evidence of implemented or live-tested authentication.

## Model selection and tutoring harness — September 8

The founder wants inexpensive models supported by a strong tutoring harness and raised GLM 5.3 Flash and Muse Spark 1.3 alongside Gemini 3.8 Flash. Gemini remains the initial candidate until comparative evidence supports a change. Keep the backend model choice configurable behind a bounded allowlist; choose the cheapest model that meets each implemented task's quality, latency and tool-contract requirements. Add task-specific routing only when evaluations demonstrate a useful difference. Model self-reported confidence alone cannot authorize escalation or additional spending.

The harness must supply relevant source revisions and learner context, distinguish quoted source evidence from model inference, validate citations against the supplied material, validate all tool arguments and bound retries, context and output. Use deterministic calculations and reviewed explanation recipes where available. Human notes remain separately attributed, and imported results do not establish mastery. These mechanisms improve reliability but do not guarantee correct misconception diagnosis, explanations or learning-path judgments from any model.

Compare source-grounded explanation, misconception diagnosis, learning-path adaptation and tool/recipe planning with identical synthetic cases, prompt/context versions, model identifiers and bounded output budgets. The [tutoring evaluation contract](tutor-evaluation.md) defines three concrete cases and the nine-request comparison ceiling, subject to remaining shared allowance. Assess factual support, diagnosis, pedagogical usefulness, invalid tool calls, latency and actual cost; malformed or unsupported output must fail safely. The existing US$2/10-request live allowance permits only an initial smoke comparison, not a statistically reliable tutoring-quality claim. Do not expand it implicitly or run provider calls outside the authenticated backend acceptance path.

Primary catalog check on September 8: [GLM 5.3 Flash](https://openrouter.ai/z-ai/glm-5.3-flash) lists many standard providers at US$0.15/0.50 per million input/output tokens, with cheaper and promotional endpoints; [Gemini 3.8 Flash](https://openrouter.ai/google/gemini-3.8-flash) lists US$0.75/3.75 and discounted Flex endpoints; [Muse Spark 1.3](https://openrouter.ai/meta/muse-spark-1.3) lists US$1.25/4.25. Prices and endpoint capability support must be refreshed before admission. GLM's catalog advertises JSON output without schema enforcement; Gemini advertises JSON-schema structured outputs. Application-side validation remains mandatory for every model. No comparative tutoring evaluation has run yet.

## Desktop account/session implementation — September 8

The desktop now initializes Better Auth's supported Electron client in main,
opens GitHub's direct `/electron/init-oauth-proxy` provider flow, renews via
`/api/auth/get-session`, and fetches authoritative public account/quota state from
`/v1/account`. The renderer receives only named account operations and plain
public state. Cookies, callback tokens, PKCE values and raw request controls stay
in main.

AR-40 routes SDK `/api/auth/*` calls through Node's main-process global `fetch`:
Electron `net.fetch` filters `Set-Cookie`, preventing the supported SDK from
capturing exchanged or renewed session cookies. The wrapper retains the fixed
origin/auth-path allowlist, manual redirect rejection, ten-second deadline and
256 KiB response limit. `/v1/account` keeps its existing Electron transport.
Unit and real Electron lifecycle tests use synthetic loopback HTTP responses
through Node fetch to verify cookie capture; they do not establish live GitHub
or deployed-backend acceptance.

The SDK encrypts session values with Electron `safeStorage`; a synchronous narrow
adapter atomically stores only its two allowlisted ciphertext keys with mode
`0600`. Sign-in fails closed when encryption is unavailable or Linux reports
`basic_text`. Cancellation advances a local generation, removes the SDK's exact
pending state and prevents late exchange/session writes from repopulating cleared
credentials. Sign-out clears locally before a bounded remote revocation request
and reports when that revocation cannot be confirmed.

Better Auth Electron 1.7.3 declares `kElectron` in `client.d.mts` but does not
export it from the shipped `client.mjs`. Its implementation stores state in the
global `Symbol.for('better-auth:electron')` registry. The desktop uses only that
exact registry to delete cancelled/mismatched attempt state; SDK code still owns
state generation, PKCE and token exchange. This compatibility wrapper has focused
tests and should be removed when the package publishes a usable cancellation API
or matching runtime export. The same upgrade checklist must re-verify the SDK's
swallowed encrypted-storage write errors and its two raw IPC sends. Main supplies
`getWindow: () => null` to suppress `better-auth:authenticated`; version 1.7.3's
internal fetch-error path can still target the focused window with
`better-auth:error`, but no preload listener exposes that SDK-owned channel.

The provider key-file importer is retired: the app neither reads nor deletes nor
uploads previously imported development credential files. Direct environment-key
tutoring remains only behind the explicit non-packaged
`APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR=true` test/development gate and is disabled
in packaged behavior. Astra Settings/onboarding and authenticated backend
learning-request/result adoption remain separate follow-up slices, so this is not
whole-AR-12 completion.

## Implementation gate

Implement the approved Railway/Better Auth/GitHub direction with the accepted session and monthly usage policies. Configure and verify the actual desktop callback and backend services before live acceptance. Missing account access must be surfaced immediately while independent implementation continues. The founder's backend setup authorization does not extend to unrelated paid upgrades or unbounded render capacity.

The approved replacement must include:

- Backend-only runtime secrets, environment separation, least privilege, rotation and redacted diagnostics.
- Authenticated and authorized AI endpoints; bounded context/input, model/tool policy, per-user usage/rate/spend limits and cancellation/timeouts.
- User-facing signed-in, expired-session, unavailable-service and quota/error states; preserve offline local work.
- Removal of production key-file onboarding, with an explicit migration/development-access plan that does not delete unrelated user files or silently upload existing personal keys.
- Tests for unauthorized access, expired/revoked sessions, quota enforcement, provider failures and secret leakage; real Electron sign-in/session-boundary checks as applicable.
- Independent architecture/security review in addition to TypeScript/Effect checks and Sonar.

Use maintained authentication and platform components, with approved exact versions. Effect can express validated configuration, typed failures, service composition and resource lifetime; it is not a secrets manager or an authentication provider. Do not build custom token cryptography, an ad hoc credential parser or a bespoke auth framework.

Sources: [Railway variables](https://docs.railway.com/variables), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). OpenRouter's [PKCE connection](https://openrouter.ai/docs/guides/overview/auth/oauth) was evaluated as the user-funded alternative; it was not selected for the shipped MVP.

## Concrete deployment and callback seam — September 8

Railway PostgreSQL is running and an API service is provisioned at `https://api-production-e7aa.up.railway.app`. Database connection, backend authentication secret and company provider credential are configured as service-scoped runtime variables. `AI_ENABLED=false` remains in force while implementation and live acceptance are pending. Provisioning is not evidence that an API has been deployed.

The new Applied Research GitHub OAuth application uses the exact server callback `https://api-production-e7aa.up.railway.app/api/auth/callback/github`; wildcard matching and device flow are disabled. The founder explicitly approved generating and storing its client secret after automatic approval review requested confirmation. The founder completed GitHub account confirmation. Automatic approval review then refused programmatic secret extraction even with explicit generation/storage authorization; the founder was asked to copy it directly into the Railway API GITHUB_CLIENT_SECRET variable. The public client ID and client secret are now configured in the Railway API production service, verified by presence-only checks on September 8 after the founder saved the variable. Secret values were not printed. Real sign-in remains unverified until the desktop client is integrated and the system-browser flow succeeds. No secret values belong in this document.

Use the supported Better Auth Electron plugin/provider flow, with application scheme `com.aaryandas.appliedresearch` and desktop callback `com.aaryandas.appliedresearch://auth/callback`. The server callback above and desktop callback are different stages. The SDK owns its state/PKCE exchange; register the OS protocol through Electron, validate callbacks against the configured scheme/path, and accept only a currently pending sign-in. Keep OAuth/account tokens and session transport in main. Use the supported custom storage adapter backed by safeStorage, refusing unavailable encryption or Linux basic_text. Configure the SDK to preserve the existing narrow preload bridge and CSP; do not install a broad default bridge or image proxy.

Implement through the reviewed stable Better Auth/Electron/Drizzle adapter 1.7.3 family, Drizzle 0.45.2, pg 8.23.0 and Effect 3.22.1, verifying exact published peers before installation. Main exposes accountStatus/signIn/cancelSignIn/signOut and bounded learning request/cancel operations with serializable public states; no session token crosses preload. Tests must exercise callback/state mismatch, repeated/cancelled callbacks, session expiry/revocation, offline clearing and secure-storage failure. This is a concrete implementation contract, not a claim that supported-library use alone satisfies these cases.

## Implemented authenticated backend slice — September 8

`src/backend/` now provides the deployable server boundary without changing the existing desktop credential path. It serves secret-free `GET /health` and database-backed `GET /ready`, delegates `/api/auth/*` to Better Auth, exposes the session-derived account and UTC-month quota at `GET /v1/account`, and accepts validated idempotent learning work at `POST /v1/learning/requests`. Better Auth uses its supported Node handler, GitHub provider and Electron server plugin. The only trusted desktop origin is `com.aaryandas.appliedresearch:/`; the SDK's state/PKCE proxy and token exchange remain Better Auth responsibilities. Database cookie caching is disabled and every account or paid request resolves the current database session. That protected-route lookup does not forward Better Auth response headers, so it does not promise delivery of a renewed cookie; the desktop SDK must call Better Auth's `/api/auth/get-session` flow and persist any refreshed cookie that handler returns.

The initial learning allowlist contains only `google/gemini-3.8-flash`. Admission metadata was refreshed from OpenRouter's official catalog on 2026-09-08: US$0.75 per million input tokens, US$3.75 per million output tokens and US$14 per thousand web-search calls, with structured output advertised. This slice enables structured output only: web search, plugins, tools, recipes, automatic fallbacks and generated-code execution are absent. A 64 KiB request, 48,000-character aggregate canonical-source cap, 2,048 requested output-token limit, additional 1,024 requested reasoning-token allowance, 45-second duration and eight-request provider concurrency ceiling bound each provider call. Admission computes a per-request reservation from the exact final serialized provider body using a deliberately pessimistic one UTF-8 byte per input token, plus the requested output and reasoning allowances at the output price. Gemini may map the requested thinking budget to a thinking level rather than an exact token ceiling. Production AI must remain disabled until the total billable-output ceiling is established from the supported provider contract and verified in bounded live acceptance; sample usage alone does not prove a worst-case ceiling. OpenRouter `provider.max_price` repeats the verified prompt/completion/request ceilings, requires parameter support and refuses fallback routes; reasoning is conservatively priced as output. The current usage-accounting documentation says usage is always returned and `usage.include` is deprecated and has no effect, so the request intentionally omits that no-op field. Unknown actual cost still retains the conservative reservation. Sources: [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). Pricing older than 30 days fails admission until it is reviewed. Citation validation proves only that a returned Unicode-scalar-aligned UTF-16 range and quote match supplied canonical text; it does not establish external discovery or factual correctness.

Usage is stored in integer micro-US-dollars. A PostgreSQL transaction locks the account's UTC-month ledger before checking committed plus outstanding reservations and the two-active-request per-account fairness limit, then records an account-scoped request hash and reservation atomically. Terminal uncertainty still counts monetarily but no longer consumes an active-request slot. Reserve and settle ownership are uninterruptible; only provider work is interruptible. Cancellation before provider dispatch releases a committed reservation, while cancellation after possible dispatch retains it. Known cost is reconciled and the returned/stored success uses the authoritative settled quota; a provider response proven not to be charged releases the reservation; timeout, interruption or other uncertain cost retains it. Duplicate request ids return the stored public outcome and never call the provider again; reuse with different input is rejected. Retained/charged failures are not marked retryable because a new call could double-spend; a later explicit user action must use a new id, while the original id remains a terminal replay. There is no daily quota and no general task-recovery engine.

The coordinator classified the expanded API `DATABASE_URL` as a PostgreSQL URL on the exact private `railway.internal` namespace with no `sslmode` or other TLS parameter. That case and loopback may explicitly use non-TLS PostgreSQL because Railway's private network is an encrypted WireGuard mesh; public hosts always use certificate-verified TLS, and public TLS disable/no-verification URL overrides are rejected. Railway also documents its current PostgreSQL template as SSL-enabled; that does not erase the separately observed private-host transport classification. Pool acquisition, server statements/row-lock waits, client query waits and idle transactions have finite timeouts. Server-cancelled statements roll their transaction back; if the client cannot know whether a reserve or settlement completed (for example, a network partition around commit), the API reports conservative retained accounting. Automatic reconciliation of such terminal uncertainty is intentionally deferred. Sources: [Railway private networking](https://docs.railway.com/networking/private-networking/how-it-works), [Railway PostgreSQL](https://docs.railway.com/databases/postgresql).

Published registry metadata was checked before the exact lockfile install. The notices relevant to this slice are: `better-auth`, `@better-auth/electron`, `@better-auth/drizzle-adapter`, `pg`, `effect` and `@types/pg` are MIT; `drizzle-orm` is Apache-2.0. Better Auth 1.7.3 accepts Drizzle `^0.45.2 || >=1.0.0-rc.1 <2.0.0`, pg `^8.0.0`, React 18/19 and Vitest 2/3/4. The Electron plugin requires Node 22+, Electron 36+, Better Auth/Core `^1.7.3` and its published exact Better Auth utility peers. The Drizzle adapter accepts Drizzle `^0.45.2 || >=1.0.0-rc.1 <2.0.0`; Drizzle's pg peer is `>=8`; pg 8.23.0 requires Node 16+. Node 24, Electron 44 and Vitest 4 satisfy these ranges without forced peer resolution. Sources: [Better Auth Electron](https://www.better-auth.com/docs/integrations/electron), [Better Auth Node](https://www.better-auth.com/docs/integrations/node), [OpenRouter Gemini 3.8 Flash](https://openrouter.ai/google/gemini-3.8-flash), [OpenRouter usage accounting](https://openrouter.ai/docs/api-reference/overview#usage-accounting).

This is not whole-AR-12 completion. The account/session SDK, main/preload bridge,
OS-backed ciphertext persistence and offline local clearing are implemented in the
desktop slice described above. Astra Settings/onboarding and authenticated
learning-result adoption remain follow-ups. The founder completed GitHub account
confirmation; external secret/configuration, deployment, migration execution
against Railway and live provider acceptance remain coordinator gates. Synthetic
SDK/provider responses are not live-service evidence.

## Combined desktop dependency verification — September 8

Better Auth 1.7.3 declares an optional better-sqlite3 ^12.0.0 peer. The separately reviewed storage binding 13.0.3 therefore cannot resolve in the combined package without bypassing peer checks. The integration pins the latest available stable 12.x release in the configured registry, better-sqlite3 12.11.1, with unchanged Drizzle 0.45.2. No forced peer resolution or overrides are used. An isolated compatibility probe passed 19 real storage/migration tests and reopened a version-13-created normalized database in both Node 24.20.0 and Electron 44.2.0 with exact Unicode text intact. Native Electron rebuild succeeded. The binding still brings deprecated prebuild-install transitively; the maintained binding remains the selected dependency, and npm audit reported zero vulnerabilities in the isolated probe. Full combined and packaged checks remain the integration gate.
