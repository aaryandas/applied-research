# Production credentials and AI access

Decision: **app-managed AI through our backend**, explicitly selected by the founder in [AR-12](https://linear.app/aaryan-das/issue/AR-12). This supersedes the MVP's user-imported OpenRouter key as the shipped onboarding path. OpenRouter remains the selected provider; Effect v3 is selected for the next backend work.

On 2026-09-08 UTC, the founder selected **Railway** and **Better Auth with GitHub sign-in**, replacing the proposed Auth0 option. Use the supported Electron integration with system-browser sign-in, validated callback/state handling and credentials confined to main-process secure storage. Exact dependency compatibility and session policy must be verified before adoption; hosting/domain setup and production spend policy remain separate gates. See AR-6 and AR-12 for the decision receipt.

## Accepted ownership

Users sign in to Applied Research. The desktop authenticates requests to our backend; the backend authorizes the user, enforces usage/spend policy and calls OpenRouter using a backend-only provider credential. Saved learning work remains locally owned and editable offline. The backend receives only the context needed for the requested AI operation, consistent with the accepted local-authority model.

Store the company provider key in supported managed secrets supplied to the backend runtime. Railway is the selected host; service-scoped runtime variables are the proposed secret delivery mechanism, and they are not a mechanism for securely distributing a company key to installed Electron clients. Never bundle the provider key, a Railway token or infrastructure secret-manager credentials into desktop code, renderer variables or an installer.

The desktop may need user session credentials. Select a supported desktop sign-in/session mechanism and appropriate OS-backed storage for those credentials. That is distinct from storing the company's OpenRouter key. A credential-store primitive alone does not implement authentication, authorization, expiry, refresh, logout or revocation.

## Current implementation gaps

`src/main/index.ts` currently accepts an environment key or reads a user-selected plaintext key file, uses an ad hoc regex, then persists encrypted ciphertext through Electron `safeStorage`. That is the current development/MVP implementation, not the production contract. `safeStorage` itself is a supported Electron API; the gaps are credential ownership, onboarding and lifecycle, rather than a need to invent encryption.

The importer reads before checking size; its Linux backend checks are not consistently applied to restore; provider status means a nonempty key rather than verified access. Replacing `.match()` with `.exec()` would address a Sonar suggestion without resolving this design. Do not close AR-12 on that basis, or use a green Sonar gate as production acceptance.

## Implementation gate

Before dependent backend implementation, resolve the remaining desktop callback/session policy, hosting configuration and usage/spending policy for the selected Railway/Better Auth/GitHub direction. Missing accounts, keys or deployment access must be surfaced immediately. The ownership decision does not itself authorize a hosting purchase, provider switch or arbitrary auth-library choice.

The approved replacement must include:

- Backend-only runtime secrets, environment separation, least privilege, rotation and redacted diagnostics.
- Authenticated and authorized AI endpoints; bounded context/input, model/tool policy, per-user usage/rate/spend limits and cancellation/timeouts.
- User-facing signed-in, expired-session, unavailable-service and quota/error states; preserve offline local work.
- Removal of production key-file onboarding, with an explicit migration/development-access plan that does not delete unrelated user files or silently upload existing personal keys.
- Tests for unauthorized access, expired/revoked sessions, quota enforcement, provider failures and secret leakage; real Electron sign-in/session-boundary checks as applicable.
- Independent architecture/security review in addition to TypeScript/Effect checks and Sonar.

Use maintained authentication and platform components, with approved exact versions. Effect can express validated configuration, typed failures, service composition and resource lifetime; it is not a secrets manager or an authentication provider. Do not build custom token cryptography, an ad hoc credential parser or a bespoke auth framework.

Sources: [Railway variables](https://docs.railway.com/variables), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). OpenRouter's [PKCE connection](https://openrouter.ai/docs/guides/overview/auth/oauth) was evaluated as the user-funded alternative; it was not selected for the shipped MVP.
