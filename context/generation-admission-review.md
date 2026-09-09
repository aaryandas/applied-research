# Generation admission review — 2026-09-09

Read-only review for the coordinator. Final local source inspection: integration commit `7c68a6833ca41d7fb38d013a825547037e680483` in `/private/tmp/capstone-today`. No application edits, credential reads, paid inference, configuration changes, or production enablement were performed. Public catalog GETs are metadata reads, not generation requests.

## Recommendation

Keep `google/gemini-3.8-flash`. Do not treat the lack of an exact reasoning allocation as evidence that total generation is unbounded. The supported OpenRouter API contract, corroborated explicitly by Google's Genkit OpenRouter documentation, supports treating top-level `max_tokens` as the combined thinking-plus-visible-output budget. This is a materially stronger admission argument than the current claim that `reasoning.max_tokens: 1024` is a hard thinking ceiling.

My recommendation is to submit that combined-cap argument, the exact request below, and a scoped cumulative allowance gate for independent review, then perform one already-authorized synthetic authenticated smoke request. This report does not change `AI_ENABLED=false` or waive the repository's requirement for reviewed code and bounded live acceptance. It does not require a new model choice or larger spending allowance.

The evidence distinction matters: an explicit combined-limit explanation exists in the official integration documentation; I did not locate public OpenRouter server-side Gemini 3.8 adapter source or a Gemini-3.8-specific promise spelling out its exact upstream mapping. Treat the documented API contract as the basis, not a claim to have inspected that closed gateway implementation. If the independent reviewer requires that more specific guarantee, the precise remaining question is included below.

## What the primary sources establish

1. **Top-level limit:** OpenRouter documents `max_tokens` as the upper bound on tokens generated in a response. It separately documents `max_completion_tokens` with the same general meaning. Renaming the field alone adds no stronger guarantee. The current model catalog advertises `max_tokens`. [OpenRouter parameters](https://openrouter.ai/docs/api_reference/parameters)

2. **Combined budget:** Google's Genkit OpenRouter documentation explicitly explains that its `MaxOutputTokens` becomes top-level `max_tokens`, and a reasoning model consumes this budget with thinking before producing visible output. Exhausting it in thinking can produce an empty response with a length finish reason. This supports a combined ceiling, rather than a separate visible allowance plus unlimited thinking. It is an official integration contract covering OpenRouter reasoning models generally, not a published audit of OpenRouter's Gemini 3.8 upstream adapter. [Genkit OpenRouter reasoning and generation settings](https://genkit.dev/docs/go/integrations/openrouter/#reasoning)

3. **Allocation is different:** For Gemini 3, OpenRouter maps reasoning effort to Google's thinking level. Sending `reasoning.max_tokens` passes a thinking budget which Google may translate into a level; published documentation explicitly says precise token breakpoints per level are unavailable. Reasoning tokens are billed as output. `exclude: true` hides returned reasoning; it does not disable thinking. Thus the current 1,024 requested thinking tokens must not be described as a verified independent hard ceiling. [OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)

4. **Native Google wording:** `GenerationConfig.maxOutputTokens` limits tokens included in the response candidate. Google exposes separate `candidatesTokenCount` and `thoughtsTokenCount`, and defines total usage as prompt, thoughts, and response candidates. That API reference alone does not spell out the desired inequality `thoughts + candidates <= maxOutputTokens`. Its field wording is less explicit than the Genkit explanation; do not manufacture that exact sentence as a Google GenerateContent quote. [GenerateContent reference](https://ai.google.dev/api/generate-content)

5. **Model maximum:** Google's Gemini 3.8 Flash page lists 1,048,576 input tokens and 65,536 output tokens, and supports low, medium, and high thinking; minimal returns an error. That table alone does not explicitly define the 65,536 as raw thoughts plus visible text. It is not an independent fallback proof permitting us to disregard a failed requested cap. [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)

The Google-owned `google/skills` inference reference also says thinking consumes `maxOutputTokens` before visible output, but the surrounding example is a tuned/custom Gemini 2.5 deployment. It is corroboration, not the exact Gemini 3.8 route guarantee. Public client SDKs can show client-to-OpenRouter serialization; they do not prove OpenRouter-to-Google gateway behavior. [Google inference reference](https://raw.githubusercontent.com/google/skills/main/skills/cloud/agent-platform-inference/SKILL.md)

## Current catalog and request

Public OpenRouter metadata fetched on September 9 reports:

| Field                                   | Observed value                             |
| --------------------------------------- | ------------------------------------------ |
| App model ID                            | `google/gemini-3.8-flash`                  |
| Canonical slug                          | `google/gemini-3.8-flash-20260902`         |
| Prompt price                            | $0.75 / million tokens                     |
| Completion and internal reasoning price | $3.75 / million tokens                     |
| Maximum completion tokens               | 65,536                                     |
| Reasoning                               | Mandatory; low/medium/high; medium default |
| Exact reasoning-budget support metadata | `supports_max_tokens` absent               |

Standard `google-ai-studio` advertises the current strict-output, token-limit, and temperature parameters. Standard Vertex metadata omitted temperature during this read. Flex and priority are separate endpoint tiers with different prices; do not silently change tiers for this acceptance run. [Model metadata](https://openrouter.ai/api/v1/model/google/gemini-3.8-flash), [endpoint metadata](https://openrouter.ai/api/v1/models/google/gemini-3.8-flash-20260902/endpoints)

Proposed bounded request fragment for review, retaining the selected model and current 2,048 total-token request:

```json
{
  "model": "google/gemini-3.8-flash",
  "max_tokens": 2048,
  "reasoning": { "effort": "low", "exclude": true },
  "provider": {
    "only": ["google-ai-studio"],
    "allow_fallbacks": false,
    "require_parameters": true,
    "max_price": { "prompt": 0.75, "completion": 3.75, "request": 0 }
  }
}
```

Retain the existing strict JSON schema, one candidate, synthetic bounded text messages, 45-second timeout, no tools/plugins/search, and no retry loop. Low is a supported, economical smoke setting, not a claim that course-quality acceptance should use low forever. Medium is also supported and remains subject to the same combined ceiling. A 2,048 total budget may truncate complicated output; truncation is a charged, observable failure rather than permission to increase the cap automatically.

The provider pin makes the receipt attributable to one standard route. OpenRouter says service-tier endpoints require explicit opt-in and are not included by a base provider slug; `require_parameters` prevents silently dropping requested controls. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)

## Existing implementation and required narrow changes

`src/backend/provider.ts:323` sends `max_tokens: 2048` and `reasoning.max_tokens: 1024`. `reservationMicrousdFor` at line 351 uses the exact final serialized request's UTF-8 byte length as a deliberately pessimistic input-token estimate, plus 3,072 tokens at the completion price. If the documented top-level combined cap holds, the current 3,072-token monetary reservation already exceeds the 2,048 combined ceiling. It is conservative money, not evidence that thinking is capped separately at 1,024.

Update the policy terminology and reasoning request to match the actual contract. Keeping the existing monetary margin for the initial smoke avoids reducing reserves during acceptance. Add a focused request/reservation regression proving that the reservation covers the declared combined cap even when thinking uses all of it; do not write a mock test and claim it proves provider behavior.

The application already reserves in PostgreSQL before dispatch, settles known `usage.cost`, retains unknown charges, rejects conflicting reuse, and replays completed duplicate IDs. It does **not** implement the separate global development allowance of $2 and 10 generation requests. Its per-account UTC-month $20 quota and concurrency limits cannot enforce that cumulative evaluation cap across accounts or restarts.

The provider parser requires cost and a complete valid response, but does not currently record and validate all prompt/completion/reasoning usage counters. Preserve those counters in a bounded, secret-free acceptance receipt. Google's native counters and OpenRouter's normalized counters have different breakdowns; do not double-add a reasoning subset to an inclusive completion count. The authoritative charged amount remains `usage.cost`. [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)

## Recorded remaining original allowance

The evidence inspected records **$0 spent / 0 live generation requests; therefore $2 and 10 requests remain in the recorded allowance**. This is a receipt reconciliation, not a live billing-account audit. The coordinator must reconcile any newer concurrent-worker receipt before reserving the first request.

| Evidence                                                                                  | What it records                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| AR-7 comment `3e71e6df-5e30-41c1-b91b-ca4343d2115b`, 2026-09-08 04:17 UTC                 | Founder authorization: cumulative $2 / 10 synthetic requests after checks |
| AR-7 comment `4d8409b9-4f82-444e-816f-35304f005cf6`, 11:17 UTC                            | $0 / 0 used                                                               |
| AR-12 comment `86f47117-e427-47fb-810a-176bc0bdcf5f`, 11:40 UTC                           | Same allowance unchanged and unused                                       |
| AR-13 description read with updatedAt 2026-09-09 07:44 UTC                                | Explicitly repeats $2 / 10, with $0 / 0 used                              |
| AR-13 comment `6cd3211e-f08a-4abc-a1a1-20f22796adc9`, September 8 19:00 UTC               | Deployment health/readiness verification used no provider calls           |
| `/private/tmp/ar-gauntlet-20260908/coordinator-state.json`, updated September 8 21:14 UTC | `liveRequestsUsed: 0`, `liveDollarsUsed: 0`, AI disabled                  |

Issue records: [AR-7](https://linear.app/aaryan-das/issue/AR-7), [AR-12](https://linear.app/aaryan-das/issue/AR-12), [AR-13](https://linear.app/aaryan-das/issue/AR-13). The preflight and takeover temp receipts agree. No newer positive consumption was found in the inspected AR-7/12/13/27 comment histories or those local receipts. The $0.25 embedding evaluation is a separate authorization and cannot replenish this allowance.

## Minimal already-authorized smoke sequence after review

1. Reconcile the cumulative receipt. Persist a single global evaluation identifier with original limits 2,000,000 micro-USD and 10 physical generation dispatches. Reserve before dispatch; prevent concurrent runners and retain uncertain reservations. Do not reset this counter per account, retry, process, or deployment.
2. Gate this evaluation to the approved synthetic account/request IDs. Do not expose unrestricted production generation merely to perform the smoke. Preserve normal disabled behavior outside the scoped evaluation.
3. Use one `POST /v1/learning/requests` source-grounded-tutor operation, with the existing synthetic density case: mass 6 g, volume 3 mL, composition not measured; learner incorrectly computes 0.5 g/mL and asks if it is water. Expected answer corrects the ratio to 2 g/mL, does not infer composition, cites the supplied text exactly, and suggests an appropriate next action.
4. Bound the final serialized provider body before admission and compute its actual reservation. For an **illustrative** body no larger than 8,192 UTF-8 bytes, the existing 3,072-token output reserve is `ceil(8192 * 0.75 + 3072 * 3.75) = 17,664` micro-USD, or $0.017664. A $0.02 smoke sublimit would cover that request under the reviewed policy. If the real schema/body exceeds that size, fail preflight and calculate a new bounded sublimit inside the original $2; never silently assert the illustration fits.
5. Make one physical provider dispatch. Record request ID, exact revision, model/route, transmitted cap, schema version, reserved money, response status/finish reason, usage/cost, citation validation, and remaining cumulative allowance. Count every dispatched attempt against the ten, including charged failures and unknown outcomes. A timeout may still be billed; retain the reservation and do not auto-retry.
6. Replay the same authenticated request ID to verify stored outcome/idempotence without another physical dispatch. Complete/stop this scoped run. A valid output and accounting receipt satisfy this small live acceptance case; they do not statistically prove the worst-case token contract or complete course-quality acceptance.

Do not start with the full sourced-course operation merely because it is one UI action: existing `learning-api.ts` and `sourced-learning/generation.ts` can invoke path generation, path support review, lesson generation, and lesson support review—four physical paid requests. New onboarding phases also need explicit accounting. AR48 owns the sourced-pipeline idempotence/trust repairs; use the reviewed revision before testing that path.

## Exact unresolved question if stricter provider confirmation is required

For OpenRouter Chat Completions, `google/gemini-3.8-flash` canonical September 2 model, standard `google-ai-studio`, one candidate, strict JSON schema, no tools/fallbacks, `max_tokens: 2048`, and supported `reasoning.effort: low`: does OpenRouter forward an unchanged combined Google `maxOutputTokens` bound such that **all billed raw thinking tokens plus visible candidate tokens are at most 2,048**, even with `reasoning.exclude: true`? If not, what request setting enforces that combined inequality, including potentially charged timeout/error outcomes?

No support message was sent. This is the precise remaining adapter-level question, not a recommendation to replace Gemini or a finding that its output is unbounded.
