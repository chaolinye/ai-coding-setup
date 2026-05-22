# AI Coding Setup

My personal AI coding agent configuration, synced from `~/.pi/agent/`.

## Structure

```
ai-coding-setup/
├── pi/                    # pi coding agent configuration
│   ├── settings.json     # stripped of secrets
│   ├── extensions/       # custom TypeScript extensions
│   ├── npm/              # pi package manifest (pi-web-access, etc.)
│   ├── skills/           # skills from installed packages
│   └── prompts/          # prompt templates (/command shortcuts)
├── sync.sh               # sync script — copy from agent, commit & push
└── README.md
```

## Usage

```bash
# Sync latest config and push to remote
./sync.sh

# Sync without pushing
./sync.sh --no-push

# Preview changes
./sync.sh --dry-run
```
