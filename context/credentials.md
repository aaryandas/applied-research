# Production credentials and AI access

Decision: **app-managed AI through our backend**, explicitly selected by the founder in [AR-12](https://linear.app/aaryan-das/issue/AR-12). This supersedes the MVP's user-imported OpenRouter key as the shipped onboarding path. OpenRouter remains the selected provider; Effect v3 is selected for the next backend work.

On 2026-09-08 UTC, the founder selected **Railway** and **Better Auth with GitHub sign-in**, replacing the proposed Auth0 option. Use the supported Electron integration with system-browser sign-in, validated callback/state handling and credentials confined to main-process secure storage. The session and monthly allowance policies below are approved. Dependency compatibility, callback configuration and deployed behavior still require implementation evidence; unrelated hosting upgrades or unbounded spend are not authorized. See AR-6 and AR-12 for the decision receipt.

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

## Current implementation gaps

`src/main/index.ts` currently accepts an environment key or reads a user-selected plaintext key file, uses an ad hoc regex, then persists encrypted ciphertext through Electron `safeStorage`. That is the current development/MVP implementation, not the production contract. `safeStorage` itself is a supported Electron API; the gaps are credential ownership, onboarding and lifecycle, rather than a need to invent encryption.

The importer reads before checking size; its Linux backend checks are not consistently applied to restore; provider status means a nonempty key rather than verified access. Replacing `.match()` with `.exec()` would address a Sonar suggestion without resolving this design. Do not close AR-12 on that basis, or use a green Sonar gate as production acceptance.

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

The new Applied Research GitHub OAuth application uses the exact server callback `https://api-production-e7aa.up.railway.app/api/auth/callback/github`; wildcard matching and device flow are disabled. The founder explicitly approved generating and storing its client secret after automatic approval review requested confirmation. GitHub now requires the founder to complete its account-confirmation screen before generation can proceed. Code and synthetic tests may proceed; real sign-in cannot pass until that configuration is completed. No secret values belong in this document.

Use the supported Better Auth Electron plugin/provider flow, with application scheme `com.aaryandas.appliedresearch` and desktop callback `com.aaryandas.appliedresearch://auth/callback`. The server callback above and desktop callback are different stages. The SDK owns its state/PKCE exchange; register the OS protocol through Electron, validate callbacks against the configured scheme/path, and accept only a currently pending sign-in. Keep OAuth/account tokens and session transport in main. Use the supported custom storage adapter backed by safeStorage, refusing unavailable encryption or Linux basic_text. Configure the SDK to preserve the existing narrow preload bridge and CSP; do not install a broad default bridge or image proxy.

Implement through the reviewed stable Better Auth/Electron/Drizzle adapter 1.7.3 family, Drizzle 0.45.2, pg 8.23.0 and Effect 3.22.1, verifying exact published peers before installation. Main exposes accountStatus/signIn/cancelSignIn/signOut and bounded learning request/cancel operations with serializable public states; no session token crosses preload. Tests must exercise callback/state mismatch, repeated/cancelled callbacks, session expiry/revocation, offline clearing and secure-storage failure. This is a concrete implementation contract, not a claim that supported-library use alone satisfies these cases.
