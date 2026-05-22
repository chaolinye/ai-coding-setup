---
date: 2026-05-23
type: decision
tags: [sync, backup-files, emacs, gitignore, cleanup]
---

# Exclude Emacs Backup Files from Sync Script

## Context
`sync.sh` 在复制 pi 配置到 repo 时，会无差别地把 Emacs 编辑器生成的 `.un~` 备份文件一并复制进来。这些文件被误提交到了 git 仓库，污染了工作区。

## Content
做了三项改动来彻底解决备份文件问题：

1. **删除已有备份文件** — 删除了 repo 中 5 个 `.un~` 文件：
   - `pi/extensions/.tps-tracker.ts.un~`
   - `pi/skills/grill-me/.SKILL.md.un~`
   - `pi/skills/grill-with-docs/.SKILL.md.un~`
   - `pi/skills/grill-with-docs/.ADR-FORMAT.mdd.un~`
   - `pi/skills/grill-with-docs/.CONTEXT-FORMAT.md.un~`

2. **新增 `.gitignore`** — 添加 `*.un~` 规则，防止未来误提交备份文件。

3. **修复 `sync.sh`** — 两处修改：
   - **删除主动复制备份的循环**：原来第 97-101 行有一个 `for` 循环专门复制 `.*.ts.un~` 文件，直接删掉。
   - **rsync 加 `--exclude="*.un~"`**：`copy_dir` 函数中的 rsync 命令加上排除规则，防止 skill 目录下的隐藏备份文件被复制。

## Rationale
与其每次手动清理，不如从源头（`.gitignore` + `sync.sh`）双重拦截。备份文件不应进入版本控制，也不应出现在配置文件仓库中。

## References
- Commit: `3edb1d9`
- File: `sync.sh`（copy_dir 函数、extension 复制段）
