# Project context

Start at [AGENTS.md](../AGENTS.md). For the full desktop application build, open the **[current design and build handoff](design-handoff/README.md)** and its [gauntlet prompt](design-handoff/GAUNTLET-PROMPT.md) first. This folder holds the maintained project context, split by topic so agents can read selectively. The current target is [the full desktop app](full-app.md); [MVP status](mvp.md) describes only the existing implementation.

The [active presearch session](presearch.md) reopens earlier commitments and records the limited new baseline explicitly stated during the session. Read it before treating the older product, domain, design or stack guidance below as reaffirmed.

| Page                                           | Owns                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| [Product](product.md)                          | Accepted direction, learning loop, scope and open decisions         |
| [Domain](domain.md)                            | Terms, identities, provenance and learning constraints              |
| [Architecture](architecture.md)                | Implemented process boundaries and unresolved design                |
| [Credentials](credentials.md)                  | Approved backend-owned AI access and production replacement         |
| [Practical Work](practical-work.md)            | Attempt/evidence producer, tool/guidance bounds and AR-37 wiring    |
| [Code map](code-map.md)                        | Where current behavior and checks live                              |
| [Sourced backend](sourced-backend.md)          | AR-48 authenticated discovery/acquire/sourced routes and live index |
| [Conventions](conventions.md)                  | Detailed implementation and verification rules                      |
| [Design](design.md)                            | Full visual-system specification and reference provenance           |
| [Design reference](design-system/README.md)    | Standalone specimens, owned assets and visual evidence              |
| [Development](development.md)                  | Local setup and CI workflow                                         |
| [Testing and CI](testing.md)                   | Test layers, required checks and Effect testing adoption            |
| [Local Sonar](sonar-local.md)                  | Local dashboard, credentials, scan/start/stop commands              |
| [Releases](releases.md)                        | Installer candidates, signing and Sonar configuration               |
| [Effect](effect.md)                            | Pinned upstream source, API lookup and adoption boundaries          |
| [Knowledge base](knowledge-base.md)            | Obsidian indexes and lossless migration records                     |
| [Current delivery](current-delivery.md)        | September 9 execution policy; supersedes conflicting older rules    |
| [AR56 CI checkpoint](ar-56-ci-handoff.md)      | First integration CI repair: App/Reader lifecycle, exact SHA        |
| [CI root causes](ci-root-causes-2026-09-09.md) | Shared failures, parallel repair owners and merge propagation       |

Product and domain pages govern current product intent. Architecture and checked-in code/configuration distinguish implemented behavior from proposals. The design reference includes historical specimens; its visual guidance does not override current product scope. If code and accepted intent disagree, surface the discrepancy rather than treating it as a new decision.

The original product, domain, design, and engineering documents were relocated in full. New accepted decisions belong on their owning page. Historical material remains accessible through the knowledge base. `repos/` contains explicitly requested third-party source references, not more product context; load individual files only when needed.

Before stack or architecture decisions, read the [technology decision audit](decision-audit.md). Prior decisions were not all withdrawn merely because their source documents were archived; the audit distinguishes recorded choices from implementation status and missing evidence.
