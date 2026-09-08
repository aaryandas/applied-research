# Coordinator preflight

Run at the start of every coordinator session. Surface each failure in the conversation **and** as a drafted Linear note (`factory/receipts/` when Linear MCP is absent). Continue independent work that does not depend on the failure.

| Check                                                     | Pass                                                          | On fail                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Node 24 LTS (`node -v` family 24) and `npm ci` documented | `.node-version` is `24`; `engine-strict=true`                 | Record; do not disable engines; do not dispatch product tickets that need a local install |
| Linear MCP                                                | Can read AR graph **and attach files** to issues              | Draft receipts; Park user-visible tickets (founder cannot verify without Linear video)    |
| GitHub                                                    | `gh` can read this repo, PRs, checks                          | Park landing; harness docs can still land via this agent’s git                            |
| Computer-use / RecordScreen                               | Can record a watchable Electron proof video                   | Park user-visible tickets; harness-only may continue                                      |
| Live OpenRouter budget                                    | US$2 cumulative and 10 requests (AR-7), not a fresh allowance | Park live-provider tickets; do not raise the cap                                          |
| Fable probe                                               | One bounded readonly `critic-fable` call                      | Park InReview tickets that need Fable; do not let authors self-accept                     |
| Astra                                                     | Only if a visual envelope requires gpt-6-astra                | Park those tickets; Sol High + Fable is the documented fallback, not self-review          |

Do not paste secrets into chat, Linear, renderer variables, or envelopes. Cloud Secrets (Linear, OpenRouter, Sonar) are founder-only.

Local Sonar is coordinator-owned and serialized. It is not a GitHub required check.

This environment’s Fable id: `claude-fable-5-1-thinking-high`. Implementer id: `gpt-5.6-sol[effort=high]` (baked slug `gpt-5.6-sol-high` if brackets are not honored). Record the **actual** id that ran on BOARD.
