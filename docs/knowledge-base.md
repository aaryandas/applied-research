# External knowledge base

Historical research, planning, design evidence, and product discussions live in **Obsidian Vault**, starting at **Applied Research Index**.

[Open the Applied Research index in Obsidian](obsidian://open?vault=Obsidian%20Vault&file=Applied%20Research%20Index)

The repository remains self-contained for development. Read `PRODUCT.md`, `CONTEXT.md`, `DESIGN.md`, and the engineering guides here; the vault is optional context, not a build dependency. New exploratory research belongs in the vault. Keep accepted implementation decisions and contracts in the repo.

## Migrated material

| Former repository location        | Obsidian destination                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `docs/archive/planning/`          | Applied Research - Planning Index                                     |
| `docs/archive/surface-decisions/` | Applied Research - Surface Decisions Index                            |
| `docs/archive/gauntlet/`          | Applied Research - Gauntlet Index                                     |
| `docs/archive/designs/`           | Applied Research - Designs Index                                      |
| `docs/archive/brainlift-example/` | Applied Research - Brainlift Example Index                            |
| `docs/research/`                  | Applied Research - Research Index                                     |
| `docs/product/`                   | Applied Research - Product Decisions Index                            |
| `references/`                     | Applied Research - Reference Catalog Index and the original-files ZIP |

The migration on 2026-09-07 created 72 readable project notes, linked indexes, and **Applied Research Repository Evidence 2026-09-07.zip**, preserving all 951 original files, including previously ignored captures and prototypes. The ZIP retains the original directory structure; extract it when inspecting HTML prototypes and their assets. Cloned third-party documentation stays inside the ZIP, not as hundreds of separate vault notes.

**Applied Research Migration Manifest.json** records original paths, SHA-256 hashes, and note mappings. All imported files were read back and hash-verified through Obsidian before their originals were removed from the working tree. No Git history was rewritten; earlier commits still contain the previously committed documents.

The index links to the existing Frontier brainstorming note. Historical deadlines, package versions, and "fixed" decisions are reference material only. Comparison captures and downloaded code retain their original attribution and are not application assets.
