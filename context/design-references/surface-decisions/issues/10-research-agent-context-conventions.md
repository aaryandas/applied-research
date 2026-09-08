# 10 · Research: what coding agents consume (context files, skills, MCP) in 2026
Type: research
Status: resolved
Blocked by: —

## Question
Per first-party docs as of September 2026: what do Claude Code, Codex CLI/desktop, and Cursor read automatically (CLAUDE.md, AGENTS.md, .cursor/rules, skills with SKILL.md frontmatter), with what size limits and precedence; how each registers an MCP server; and what the vendors themselves say makes a context file effective. From that, what a Context pack should contain and omit, and what a `SKILL.md` for a research vault must look like.

## Output
`docs/research/agent-context-conventions.md`, one section per agent, each fact linked to the doc that owns it. Note what `docs/mvp-prd.md` §9 already assumes and where it is now wrong.

## Answer
Findings: `docs/research/agent-context-conventions.md` (2026-09-05, first-party docs only; documented vs unverified separated).

- **No context file is universal.** Codex reads `AGENTS.md` from git root down to cwd (32 KiB combined cap); Cursor reads root and nested `AGENTS.md` and, in its CLI, a root `CLAUDE.md`; Claude Code reads `CLAUDE.md` only and documents `@AGENTS.md` as the bridge. A pack written at `applied-research/AGENTS.md` is auto-read by nobody from the repo root. The export must therefore also write or print a root pointer, and Codex's root file must inline the Brief because Codex has no import syntax.
- **Every vendor says: keep the always-loaded file thin and link out.** Anthropic excludes detailed API docs and fast-changing information; Cursor says reference files instead of copying. The PRD's 200-line `AGENTS.md` full of quoted claims contradicts this. The pack's `AGENTS.md` should hold the Brief, the human's decisions verbatim, and how to query the vault; claims go to `references/` and the MCP tools.
- **SKILL.md constraints.** `name` 1 to 64 chars, `a-z0-9-`, equal to the directory name; `description` ≤1024 chars (listing budgets are tight: Claude Code 1,536 combined, Codex 2% or 8,000 chars for the whole list); body under 500 lines or about 5k tokens; portable frontmatter is `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Discovery paths: `.agents/skills/<name>/` (Codex, Cursor) and `.claude/skills/<name>/` (Claude Code). The PRD's `context-pack/SKILL.md` location is discovered by no agent.
- **MCP.** Spec 2026-07-28 is stateless; servers must validate `Origin` (403 otherwise) and should bind loopback with auth. All three clients accept loopback HTTP with a bearer header via env-var indirection. SSE is deprecated.
- **PRD §9 is stale on:** the handler API name, the SKILL.md location, missing Host-header validation, and whether the three clients speak the 2026-07-28 spec (undocumented).
- **Consequence for the Playbook and Context pack ticket.** What the human sees before export is a file list with at least: a root `AGENTS.md` pointer (or inlined Brief for Codex), a thin project `AGENTS.md`, a `CLAUDE.md` line to paste, a skill folder per agent convention, and `references/`. The MCP tools remain the deep path; the files are the map to them.
