# External knowledge base

Historical research, planning, design evidence, and product discussions live in **Obsidian Vault**, starting at **Applied Research Index**.

[Open the Applied Research index in Obsidian](obsidian://open?vault=Obsidian%20Vault&file=Applied%20Research%20Index)

The repository remains self-contained for development. Read `context/product.md`, `context/domain.md`, `context/design.md`, and the engineering guides here; the vault is optional context, not a build dependency. New exploratory research belongs in the vault. Keep accepted implementation decisions and contracts in the repo.

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

## Tool artifacts

The remaining `.gstack/`, `.impeccable/`, `.lavish/`, and empty `.scratch/` directories were migrated on 2026-09-07. **Applied Research - Tool Artifacts** is linked from the vault index and points to **Applied Research Tool Artifacts 2026-09-07.zip**. The archive preserves all 76 files and the original directory structure, with an accompanying manifest in the archive. Its SHA-256 is `ac21d3ac6d035dfe3b7b50aa7e4c46d3635c0b1f1698baa2b11c009394cb86fb`. The vault copy was read back and verified, and original source hashes were rechecked before removal.
