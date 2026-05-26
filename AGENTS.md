# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-26

## OVERVIEW
Project: **ai-coding-setup**
Stack: Bash, TypeScript (pi extension SDK), Markdown (skills/prompts), JSON (pi settings), Git/GitHub

A configuration repository that snapshots the user's [pi coding agent](https://pi.dev) setup — settings, extensions, skills, and prompt templates — into version control. The `sync.sh` script copies resources from `~/.pi/agent/` into this repo, commits, and pushes to GitHub.

## STRUCTURE
```
/
├── AGENTS.md              # This file — robot-readable project overview
├── README.md              # Human-readable overview
├── sync.sh                # Main sync script (Bash, idempotent)
└── pi/                    # Synced pi agent configuration
    ├── settings.json      # pi settings (secrets stripped)
    ├── extensions/        # Custom TypeScript extensions
    │   ├── btw.ts         # Side-question command (/btw), 523 lines
    │   ├── copy-user.ts   # Copy last user message to clipboard (/copy-user), 44 lines
    │   └── tps-tracker.ts # Tokens-per-second live display, 105 lines
    ├── skills/            # Skills from agent skills dir + npm packages
    │   ├── code-reader/   # Cognitive-science-based code understanding (Quick/Standard/Deep)
    │   ├── feynman/       # Feynman thinking framework for learning & simplification
    │   ├── grill-me/      # Relentless plan/design stress-test interview
    │   ├── grill-with-docs/# Plan stress-test with domain model & docs update
    │   ├── init/          # AGENTS.md initialization/update via codebase analysis
    │   ├── librarian/     # Open-source library research with GitHub permalinks
    │   └── project-node/  # Structured project knowledge notes (.pi/notes/)
    └── prompts/           # Prompt template directory (/command shortcuts)
        └── plan.md        # Plan mode — analyze, propose, wait for approval
```

## COMMANDS
| Action | Command |
|--------|---------|
| Sync config & push | `./sync.sh` |
| Sync config only (no push) | `./sync.sh --no-push` |
| Preview changes (dry run) | `./sync.sh --dry-run` |

## PI AGENT CONFIGURATION

This repo maps the user's `~/.pi/agent/` configuration:

### Global settings (`pi/settings.json`)
- **Provider**: deepseek
- **Default model**: deepseek-v4-flash
- **Thinking level**: xhigh
- **Theme**: dark
- **Install packages**: pi-web-access, pi-init, pi-weixinbot
- **Registered extensions**: btw.ts (btw.ts is listed in `settings.json`; other `.ts` files exist in the repo but are not explicitly registered)
- Secrets (auth keys) are explicitly stripped by `sync.sh`

### Extensions (`pi/extensions/`)
All extensions use the pi ExtensionAPI SDK (`@earendil-works/pi-coding-agent`):

1. **`btw.ts`** — Lightweight side-question command
   - Registers `/btw <question>` command in pi interactive mode
   - Forks a read-only pi subprocess to answer questions without interrupting the main workflow
   - Uses TUI overlay for display, supports scroll and dismiss
   - Line count: 523
   - Registered in settings: yes (`+extensions/btw.ts`)

2. **`copy-user.ts`** — Copy last user message to clipboard
   - Registers `/copy-user` command in pi interactive mode
   - Walks branch history backward to find the last user message and copies it via `pbcopy` (macOS)
   - Handles both string content and text blocks (ignores images)
   - Line count: 44
   - Registered in settings: no (file synced but not enabled)

3. **`tps-tracker.ts`** — Tokens-per-second live tracker
   - Hooks into `agent_start`, `message_start`, `message_update`, `message_end`, `agent_end` events
   - Shows live tok/s during generation, reports final stats on completion
   - Works with any provider/model
   - Line count: 105
   - Registered in settings: no (hook-based, no command registration needed)

### Skills (`pi/skills/`)

**From agent skills directory (`~/.pi/agent/skills/`):**

1. **`code-reader/`** — Cognitive-science-based source code deep understanding
   - Three analysis modes: Quick (overview), Standard (understanding), Deep (mastery, parallel for large projects)
   - Uses elaboration questioning, self-explanation tests, and retrieval practice

2. **`feynman/`** — Feynman thinking framework for learning and problem simplification
   - Applies Feynman's methodologies: first-principles thinking, scientific honesty, curiosity-driven learning
   - Not a Feynman chatbot — a structured thinking framework derived from his works

3. **`grill-me/`** — Relentless plan/design stress-test interview
   - Walks down each branch of the design tree, resolving dependencies between decisions one-by-one
   - Asks questions one at a time, waiting for input before continuing

4. **`grill-with-docs/`** — Plan stress-test that challenges against the project's domain model
   - Updates CONTEXT.md and ADRs inline as decisions crystallise
   - Includes CONTEXT-FORMAT.md and ADR-FORMAT.md templates

5. **`project-node/`** — Records/retrieves project knowledge into structured notes (`.pi/notes/`)
   - Stores decisions, learnings, and context as dated entries with INDEX.md
   - Sources: `~/.pi/agent/skills/project-node/`

**From npm packages:**

6. **`init/`** — Initializes/updates `AGENTS.md` by analyzing the codebase
   - Installed via `pi-init` npm package
   - Sources: `~/.pi/agent/npm/node_modules/pi-init/skills/init/`

7. **`librarian/`** — Research open-source libraries with evidence-backed answers and GitHub permalinks
   - Excels at navigating large open-source repos with citations to exact lines of code
   - Installed via `pi-web-access` npm package
   - Sources: `~/.pi/agent/npm/node_modules/pi-web-access/skills/librarian/`

> Note: `pi-weixinbot` is also installed as an npm package (WeChat bot integration) but does not expose a skill in this repo.

### Prompt Templates (`pi/prompts/`)
- **`plan.md`** — Plan mode prompt. Triggers analysis, proposed approach, files affected, changes preview, and open questions. Blocks execution until user approves.
  - Format: Markdown with YAML frontmatter (`description`, `argument-hint`)
  - Used as `/plan <task description>` command in pi
- Ready for additional `.md` files that become `/command` shortcuts

## CODING STANDARDS
- **Language**: Bash (sync.sh), TypeScript (extensions), Markdown (skills/prompts)
- **Style (Bash)**: `set -euo pipefail`, lowercase functions, local variables, ANSI color helpers
- **Style (TypeScript)**: ES modules, JSDoc comments in Chinese + English, type imports from pi SDK, async/await
- **Style (Markdown)**: YAML frontmatter with `name`/`description` for skills, `description`/`argument-hint` for prompt templates
- **Conventions**: Idempotent operations (safe to re-run), secrets never committed, ASCII box-drawing for CLI output, helper functions abstracted (copy_file, copy_dir)

## WHERE TO LOOK
- **Source Root**: `/` (repo root)
- **Config**: `pi/settings.json`
- **Extensions**: `pi/extensions/`
- **Skills**: `pi/skills/`
- **Sync Script**: `sync.sh`
- **Human Docs**: `README.md`

## NOTES
- **Secrets stripped**: `sync.sh` uses Node.js to parse `settings.json` and delete any secret-adjacent fields before saving to the repo. The actual `auth.json` in `~/.pi/agent/` is never copied.
- **Idempotent**: `sync.sh` is safe to run repeatedly — it overwrites files, cleans up stale directories (`pi/npm/`), and skips commit if nothing changed.
- **Git remote**: `origin → git@github.com:chaolinye/ai-coding-setup.git` (main branch)
- **Init skill**: The `pi-init` package is installed (visible in `settings.json` as `"npm:pi-init"`) and is what generated this `AGENTS.md`.
