# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-22

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
    │   └── tps-tracker.ts # Tokens-per-second live display, 105 lines
    ├── skills/            # Skills from agent skills dir + npm packages
    │   └── librarian/     # Open-source library research skill (pi-web-access)
    └── prompts/           # Prompt template directory (/command shortcuts)
        └── README.md      # Placeholder with usage instructions
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
- **Thinking level**: high
- **Theme**: dark
- **Install packages**: pi-web-access, pi-init
- Secrets (auth keys) are explicitly stripped by `sync.sh`

### Extensions (`pi/extensions/`)
Both extensions use the pi ExtensionAPI SDK (`@earendil-works/pi-coding-agent`):

1. **`btw.ts`** — Lightweight side-question command
   - Registers `/btw <question>` command in pi interactive mode
   - Forks a read-only pi subprocess to answer questions without interrupting the main workflow
   - Uses TUI overlay for display, supports scroll and dismiss
   - Sources: `~/.pi/agent/extensions/btw.ts`

2. **`tps-tracker.ts`** — Tokens-per-second live tracker
   - Hooks into `agent_start`, `message_start`, `message_update`, `message_end`, `agent_end` events
   - Shows live tok/s during generation, reports final stats on completion
   - Works with any provider/model
   - Sources: `~/.pi/agent/extensions/tps-tracker.ts`

### Skills (`pi/skills/`)
1. **`project-node/`** — Records/retrieves project knowledge into structured notes (`.pi/notes/`)
   - Sources: `~/.pi/agent/skills/project-node/`

2. **`init/`** — Initializes/updates `AGENTS.md` by analyzing the codebase
   - Installed via `pi-init` npm package
   - Sources: `~/.pi/agent/npm/node_modules/pi-init/skills/init/`

3. **`librarian/`** — Research open-source libraries with evidence-backed answers and GitHub permalinks
   - Installed via `pi-web-access` npm package
   - Sources: `~/.pi/agent/npm/node_modules/pi-web-access/skills/librarian/`

### Prompt Templates (`pi/prompts/`)
- Currently empty (only a `README.md` placeholder)
- Ready for user to drop `.md` files that become `/command` shortcuts in pi
- Format: Markdown with YAML frontmatter (`description`, `argument-hint`)

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
