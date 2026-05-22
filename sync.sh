#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# sync.sh — Sync pi coding agent configuration to codehub
# ──────────────────────────────────────────────────────────────────
# Copies global pi agent config (settings, extensions, skills,
# prompt templates, packages) into this repo, commits, and pushes.
#
# Idempotent: safe to run repeatedly.
#
# Usage:
#   ./sync.sh              # sync & auto-commit & push
#   ./sync.sh --no-push    # sync & commit only, no push
#   ./sync.sh --dry-run    # show what would be copied, don't commit
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────
PI_AGENT_HOME="$HOME/.pi/agent"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=false
NO_PUSH=false

# ─── Args ─────────────────────────────────────────────────────────
for arg in "$@"; do
	case "$arg" in
		--dry-run) DRY_RUN=true ;;
		--no-push) NO_PUSH=true ;;
	esac
done

# ─── Helpers ──────────────────────────────────────────────────────
info()  { printf "\r\033[2K  \033[1;34m•\033[0m %s\n" "$*"; }
ok()    { printf "\r\033[2K  \033[1;32m✓\033[0m %s\n" "$*"; }
warn()  { printf "\r\033[2K  \033[1;33m⚠\033[0m %s\n" "$*"; }
dry()   { printf "\r\033[2K  \033[1;36m~>\033[0m %s\n" "$*"; }

copy_file() {
	local src="$1" dst="$2"
	if [ "$DRY_RUN" = true ]; then
		dry "cp $src → $dst"
		return
	fi
	mkdir -p "$(dirname "$dst")"
	if [ -f "$src" ]; then
		cp "$src" "$dst"
		ok "$(basename "$src") → $dst"
	else
		warn "source not found: $src"
	fi
}

copy_dir() {
	local src="$1" dst="$2"
	if [ "$DRY_RUN" = true ]; then
		dry "cp -r $src/ → $dst/"
		return
	fi
	if [ -d "$src" ]; then
		mkdir -p "$dst"
		# Use rsync if available for cleaner output, fallback to cp
		if command -v rsync &>/dev/null; then
			rsync -a --delete "$src/" "$dst/"
		else
			rm -rf "$dst"
			cp -R "$src" "$(dirname "$dst")"
		fi
		ok "$(basename "$src")/ → $dst/"
	else
		warn "source directory not found: $src"
	fi
}

# ─── Main ─────────────────────────────────────────────────────────
echo ""
echo "  ╭──────────────────────────────────────────╮"
echo "  │   Sync AI Coding Resources to CodeHub    │"
echo "  ╰──────────────────────────────────────────╯"
echo ""

cd "$REPO_ROOT"

# ──────────────────────────────────────────────────────────────────
# 1. Settings — strip secrets
# ──────────────────────────────────────────────────────────────────
info "1. Copying pi settings (secrets stripped)..."

SETTINGS_DST="pi/settings.json"
if [ "$DRY_RUN" = true ]; then
	dry "generate settings (secrets stripped) → $SETTINGS_DST"
else
	mkdir -p "$(dirname "$SETTINGS_DST")"
	# Read the original, strip any sensitive fields, write to destination
	# Using node to safely parse JSON and omit auth-sensitive fields
	node -e '
		const fs = require("fs");
		const src = "'"$PI_AGENT_HOME/settings.json"'";
		const dst = "'"$SETTINGS_DST"'";
		const settings = JSON.parse(fs.readFileSync(src, "utf-8"));
		// Strip any secret-adjacent fields
		delete settings.authToken;
		delete settings.apiKey;
		delete settings.anthropicApiKey;
		delete settings.openaiApiKey;
		fs.writeFileSync(dst, JSON.stringify(settings, null, 2) + "\n");
	'
	ok "settings → $SETTINGS_DST"
fi

# ──────────────────────────────────────────────────────────────────
# 2. Extensions
# ──────────────────────────────────────────────────────────────────
info "2. Copying pi extensions..."

EXT_SRC="$PI_AGENT_HOME/extensions"
EXT_DST="pi/extensions"
for ext_file in "$EXT_SRC"/*.ts; do
	[ -f "$ext_file" ] || continue
	ext_name=$(basename "$ext_file")
	copy_file "$ext_file" "$EXT_DST/$ext_name"
done

# Copy extension .ts.un~ backup files if they exist
for ext_file in "$EXT_SRC"/.*.ts.un~; do
	[ -f "$ext_file" ] || break
	ext_name=$(basename "$ext_file")
	copy_file "$ext_file" "$EXT_DST/$ext_name"
done

# ──────────────────────────────────────────────────────────────────
# 3. Packages (npm configuration only, not node_modules)
# ──────────────────────────────────────────────────────────────────
info "3. Copying pi packages configuration..."

copy_file "$PI_AGENT_HOME/npm/package.json" "pi/npm/package.json"
copy_file "$PI_AGENT_HOME/npm/.gitignore" "pi/npm/.gitignore"
copy_file "$PI_AGENT_HOME/npm/package-lock.json" "pi/npm/package-lock.json"

# ──────────────────────────────────────────────────────────────────
# 4. Skills from installed packages
# ──────────────────────────────────────────────────────────────────
info "4. Copying pi skills..."

# Librarian skill from pi-web-access package
LIB_SRC="$PI_AGENT_HOME/npm/node_modules/pi-web-access/skills/librarian"
LIB_DST="pi/skills/librarian"
if [ -d "$LIB_SRC" ]; then
	copy_dir "$LIB_SRC" "$LIB_DST"
else
	warn "librarian skill not found (package not installed?)"
fi

# ──────────────────────────────────────────────────────────────────
# 5. Prompt templates (create placeholder)
# ──────────────────────────────────────────────────────────────────
info "5. Creating prompt templates directory..."

PROMPT_DST="pi/prompts"
if [ "$DRY_RUN" = true ]; then
	dry "mkdir -p $PROMPT_DST"
	dry "write $PROMPT_DST/README.md (placeholder)"
else
	mkdir -p "$PROMPT_DST"
	if [ ! -f "$PROMPT_DST/README.md" ]; then
		cat > "$PROMPT_DST/README.md" <<- 'PROMPT_README'
			# pi Prompt Templates

			Put Markdown prompt templates here. They become `/command` shortcuts in pi.

			```
			---
			description: Do something useful
			---
			Instructions for the task...
			```

			See [pi docs](https://pi.dev) for the full reference.
		PROMPT_README
		ok "prompts placeholder → $PROMPT_DST/README.md"
	else
		ok "prompts/ already exists, unchanged"
	fi
fi

# ──────────────────────────────────────────────────────────────────
# 6. Clean up empty or unwanted files
# ──────────────────────────────────────────────────────────────────
info "6. Cleaning up..."

# Remove node_modules if accidentally copied
if [ -d "pi/npm/node_modules" ] && [ "$DRY_RUN" = false ]; then
	rm -rf pi/npm/node_modules
	ok "removed pi/npm/node_modules (not tracked)"
fi

# Remove .gitignore within copied dirs that might interfere
if [ -f "pi/npm/.gitignore" ] && [ "$DRY_RUN" = false ]; then
	# Keep it, it's a legit part of the npm package config
	ok "kept pi/npm/.gitignore"
fi

# ──────────────────────────────────────────────────────────────────
# 7. Commit & Push
# ──────────────────────────────────────────────────────────────────
info "7. Committing and pushing..."

if [ "$DRY_RUN" = true ]; then
	dry "git add -A"
	dry "git commit -m \"sync: update pi coding agent resources\""
	dry "git push origin main"
	echo ""
	echo "  ── dry run complete ──"
	exit 0
fi

# Check for changes
if git diff --quiet && git diff --cached --quiet && ! git status --porcelain | grep -q .; then
	# No changes anywhere — check if there are untracked files
	if git ls-files --others --exclude-standard | grep -q .; then
		: # has untracked files, proceed
	else
		info "Nothing to commit — already up to date."
		exit 0
	fi
fi

git add -A

if git diff --cached --quiet; then
	info "Nothing to commit — already up to date."
	exit 0
fi

git commit -m "sync: update pi coding agent resources"

if [ "$NO_PUSH" = false ]; then
	info "Pushing to origin/main..."
	git push origin main
	ok "pushed successfully"
else
	info "Skipping push (--no-push)"
fi

echo ""
echo "  \033[1;32m✓ Sync complete\033[0m"
echo ""
