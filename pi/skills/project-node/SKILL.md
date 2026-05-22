---
name: project-node
description: Records project knowledge and decisions into structured notes (.pi/notes/), and retrieves them in future sessions. Trigger with "project note"/"record this"/"save that" (save) or "recall"/"project knowledge"/"what did we learn" (retrieve). Use whenever the user mentions saving project context or asks what we know about a topic.
---

# Project Node Skill

## Storage Location
All notes live under `.pi/notes/` in the project root (alongside `.pi/settings.json` if it exists).

```
<project-root>/.pi/notes/
├── INDEX.md                # Table of contents (auto-maintained)
└── entries/                # Individual note files
    ├── YYYY-MM-DD_type-slug-title.md
    └── ...
```

## Initialization
If `.pi/notes/` does not exist when the user first tries to save a note, create it:

```bash
mkdir -p .pi/notes/entries
```

Then write the initial `INDEX.md`:

```markdown
# Project Notes Index

| Date | Type | Title | Tags |
|------|------|-------|------|
```

---

## Note File Format

Each note is a markdown file with YAML frontmatter for metadata.

```markdown
---
date: 2026-05-22
type: decision
tags: [api, typescript]
session: <optional-session-name-or-id>
---

# Title (Sentence case, descriptive)

## Context
What prompted this note. What were we discussing or working on.

## Content
The actual knowledge, decision, or discovery in detail.

## Rationale (optional, primarily for type:decision)
Why this decision was made. Alternatives considered.

## References (optional)
Links to files, commits, issues, or external resources.
```

### Frontmatter Fields
| Field | Required | Description |
|-------|----------|-------------|
| `date` | yes | Date of recording, `YYYY-MM-DD` format |
| `type` | yes | One of: `decision`, `knowledge`, `bug`, `reference` |
| `tags` | no | Array of freeform lowercase tags for cross-referencing |
| `session` | no | Session name or ID for traceability |

---

## Type Definitions

| Type | When to Use | Example Title |
|------|-------------|---------------|
| `decision` | Architecture decisions, API design choices, tech selections, conventions | "Adopt Result Pattern for API Responses" |
| `knowledge` | Learned facts, research findings, domain insights, onboarding context | "Vitest 3.x Migration Guide" |
| `bug` | Root causes, fixes, workarounds, reproduction steps | "Auth Token Race Condition Root Cause" |
| `reference` | Commands, configs, tooling setup, external links, cheatsheets | "Staging Deploy Commands" |

---

## Workflow: Save a Note

**Trigger phrases**: "project note", "record this", "save that", "remember this", "make a note", "note that down", "把这个记下来"

### Steps

1. **Identify the type** based on the user's message content. If ambiguous, ask: _Is this a decision, knowledge, bug, or reference?_

2. **Extract/synthesize the content**:
   - **Context**: What were we discussing? Why does this matter?
   - **Content**: The core information. Be precise and complete.
   - **Rationale**: Especially important for `decision` type.
   - **Tags**: 1-5 relevant lowercase tags based on topic.

3. **Generate a filename** following this pattern:
   ```
   YYYY-MM-DD_type-slug-title.md
   ```
   - Date = today's date
   - Type = one of decision/knowledge/bug/reference
   - Slug-title = 2-5 word kebab-case summary
   - Example: `2026-05-22_decision-adopt-result-pattern.md`

4. **Write the note file** using the `write` tool:
   ```
   .pi/notes/entries/YYYY-MM-DD_type-slug-title.md
   ```

5. **Update INDEX.md**:
   - `read` the current INDEX.md
   - `edit` to append a new row to the table
   - If INDEX.md doesn't exist yet, create it (see Initialization above)

   Row format:
   ```markdown
   | YYYY-MM-DD | type | Title | tag1, tag2 |
   ```

6. **Confirm** to the user with a brief summary:
   ```
   ✅ Saved: [decision] Adopt Result Pattern for API Responses
     Location: .pi/notes/entries/2026-05-22_decision-adopt-result-pattern.md
     Tags: api, typescript, error-handling
   ```

---

## Workflow: Retrieve Notes

**Trigger phrases**: "recall", "project knowledge", "what do we know about", "what did we decide about", "show me notes", "之前关于...的讨论", "查一下笔记", "提取知识"

### Steps

1. **Read INDEX.md** to get the full table of contents:
   ```bash
   cat .pi/notes/INDEX.md 2>/dev/null
   ```
   If INDEX.md doesn't exist or is empty, inform the user: _No project notes found yet._

2. **Quick-filter using INDEX.md**:
   - If the user asks about a specific topic, parse the INDEX table to find matching rows by title, type, date, or tags.
   - Use `bash grep -i` on INDEX.md for keyword searches:
     ```bash
     grep -i "<keyword>" .pi/notes/INDEX.md
     ```

3. **Deep-read matching notes**:
   - For each matching row, derive the filename from the date and title (or just search entries/ by date).
   - `read` the full note file(s) from `.pi/notes/entries/`.
   - Fallback search if INDEX is stale or filename is unclear:
     ```bash
     ls .pi/notes/entries/ | grep -i "<keyword>"
     ```

4. **Synthesize and present**:
   - Summarize findings clearly in context of the user's current question.
   - Show key details: type, date, core content, rationale.
   - Offer: _Want me to show the full note content?_

### Examples

**User**: "what did we decide about the API error handling?"
**Model**:
```
From project notes (INDEX.md): 
| 2026-05-22 | decision | Adopt Result Pattern for API Responses | api, typescript

📄 Adopt Result Pattern for API Responses (decision, 2026-05-22)
Context: We were discussing inconsistent error handling across endpoints.
Content: All API endpoints should return Result<T, Error> instead of throwing.
Rationale: Makes error handling explicit in type signatures, eliminates try/catch.

Want me to show the full note?
```

**User**: "recall all knowledge about testing"
**Model**:
```
Searching INDEX.md for "testing"...

Found:
| 2026-05-22 | knowledge | Vitest 3.x Migration Guide | testing, vitest

📄 Vitest 3.x Migration Guide (knowledge, 2026-05-22)
...
```

---

## Edge Cases & Notes

- **INDEX.md is missing or stale**: If INDEX.md doesn't exist but `entries/` contains files, rebuild INDEX.md by scanning entries.
- **No notes found**: Inform the user politely and suggest saving a note.
- **Ambiguous type**: Default to `knowledge` if the type isn't clear.
- **Omit optional sections**: If no references or rationale, just skip them.
- **Chinese content**: Fully supported — filenames should still use English/kebab-case, but note body can be in Chinese.
- **Existing .pi/ directory but no notes/**: Create `notes/` and `notes/entries/` on first save.
