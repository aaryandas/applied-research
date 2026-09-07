# Project context

Start at [AGENTS.md](../AGENTS.md). This folder holds the complete maintained project context, split by topic so agents can read selectively.

| Page                                        | Owns                                                        |
| ------------------------------------------- | ----------------------------------------------------------- |
| [Product](product.md)                       | Accepted direction, learning loop, scope and open decisions |
| [Domain](domain.md)                         | Terms, identities, provenance and learning constraints      |
| [Architecture](architecture.md)             | Implemented process boundaries and unresolved design        |
| [Code map](code-map.md)                     | Where current behavior and checks live                      |
| [Conventions](conventions.md)               | Detailed implementation and verification rules              |
| [Design](design.md)                         | Full visual-system specification and reference provenance   |
| [Design reference](design-system/README.md) | Standalone specimens, owned assets and visual evidence      |
| [Development](development.md)               | Local setup and CI workflow                                 |
| [Releases](releases.md)                     | Installer candidates, signing and Sonar configuration       |
| [Effect](effect.md)                         | Pinned upstream source, API lookup and adoption boundaries  |
| [Knowledge base](knowledge-base.md)         | Obsidian indexes and lossless migration records             |

Product and domain pages govern current product intent. Architecture and checked-in code/configuration distinguish implemented behavior from proposals. The design reference includes historical specimens; its visual guidance does not override current product scope. If code and accepted intent disagree, surface the discrepancy rather than treating it as a new decision.

The original product, domain, design, and engineering documents were relocated in full. New accepted decisions belong on their owning page. Historical material remains accessible through the knowledge base. `repos/` contains explicitly requested third-party source references, not more product context; load individual files only when needed.
