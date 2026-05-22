/**
 * /btw Extension — 轻量级侧边问答命令
 *
 * 灵感来自 Claude Code 的 /btw 命令，允许你在 pi 执行任务时
 * 快速提问，不中断主工作流，也不污染对话上下文。
 *
 * 核心特性：
 * - **非中断**：通过 fork 子进程异步回答问题，主对话不受影响
 * - **只读**：子进程禁用所有工具（--no-tools）
 * - **上下文感知**：复用当前会话的对话历史
 * - **单轮问答**：一问一答，用完即弃
 * - **临时性**：回答不写入主会话历史，不消耗上下文窗口
 *
 * 架构流程：
 *   /btw <question>
 *       │
 *       ├─ 收集当前会话上下文（最近 30 条消息）
 *       ├─ 写入临时 prompt 文件（含 system prompt + 上下文 + 问题）
 *       ├─ spawn pi --mode json -p --no-tools --no-extensions ...
 *       │    子进程被严格约束：无工具、单轮回答、直接输出
 *       ├─ 解析 JSON 输出流 → 提取 assistant 回答
 *       └─ 在终端浮层中显示问答结果
 *             Space / Enter / Escape → 关闭
 *
 * 安装：
 *   复制到 ~/.pi/agent/extensions/btw.ts（全局生效）
 *   或复制到 .pi/extensions/btw.ts（项目级生效）
 *
 * 使用：
 *   在 pi 交互模式中直接输入 /btw <你的问题>
 *
 * 示例：
 *   /btw 刚才那个正则表达式的含义是什么？
 *   /btw 这个工具函数接收什么参数？
 *   /btw 我在这段代码中用了哪个设计模式？
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Focusable, matchesKey, visibleWidth } from "@earendil-works/pi-tui";

// ─── 常量 ───────────────────────────────────────────────────────────────

/** 子进程 system prompt — 严格约束行为 */
const SUBAGENT_SYSTEM_PROMPT = `You are a lightweight side-question answering agent.

IMPORTANT CONTEXT:
- You are a separate, lightweight agent spawned to answer this one question
- The main agent is NOT interrupted
- You share the conversation context but are a completely separate instance

CRITICAL CONSTRAINTS:
- You have NO tools available
- This is a one-off response — there will be no follow-up turns
- NEVER say "Let me try..." or promise to take any action
- Answer the question directly, concisely, and helpfully
- Use the conversation history below for context`;

/** 最多携带的上下文消息数 */
const MAX_CONTEXT_MESSAGES = 30;
/** 单条消息最大字符数 */
const MAX_MESSAGE_LENGTH = 800;
/** 上下文总最大字符数 */
const MAX_CONTEXT_CHARS = 6000;

// ─── 类型 ───────────────────────────────────────────────────────────────

interface UsageInfo {
	input: number;
	output: number;
	cost: number;
}

interface BtwResult {
	question: string;
	answer: string;
	model?: string;
	usage?: UsageInfo;
}

// ─── 上下文收集 ──────────────────────────────────────────────────────────

/**
 * 从当前会话中提取最近的对话历史，格式化为文本。
 * 只包含 user 和 assistant 角色的纯文本消息。
 */
function buildConversationContext(ctx: ExtensionCommandContext): string {
	const entries = ctx.sessionManager.getEntries();
	const parts: string[] = [];
	let charCount = 0;

	for (let i = entries.length - 1; i >= 0 && parts.length < MAX_CONTEXT_MESSAGES; i--) {
		const entry = entries[i];
		if (entry.type !== "message") continue;

		const msg = entry.message;
		if (!msg || (msg.role !== "user" && msg.role !== "assistant")) continue;

		const textContent = (msg.content ?? [])
			.filter((p: any) => p.type === "text")
			.map((p: any) => p.text)
			.join(" ")
			.slice(0, MAX_MESSAGE_LENGTH);

		if (!textContent) continue;

		const line = `[${msg.role}]: ${textContent}`;
		if (charCount + line.length > MAX_CONTEXT_CHARS) break;

		parts.unshift(line);
		charCount += line.length;
	}

	if (parts.length === 0) return "(no conversation history)";
	return parts.join("\n\n");
}

// ─── 子进程管理 ──────────────────────────────────────────────────────────

/**
 * 获取 pi 可执行文件的调用方式。
 * 优先使用当前脚本路径，fallback 到 PATH 中的 pi。
 */
function getPiInvocation(): { command: string; baseArgs: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtual = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtual && fs.existsSync(currentScript)) {
		return { command: process.execPath, baseArgs: [currentScript] };
	}
	return { command: "pi", baseArgs: [] };
}

/**
 * 在子进程中执行 pi，返回 stdout 内容。
 */
function spawnPi(fullArgs: string[], cwd: string, signal?: AbortSignal): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const proc = spawn(fullArgs[0], fullArgs.slice(1), {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		});

		const chunks: Buffer[] = [];
		const errChunks: Buffer[] = [];

		proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		proc.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

		proc.on("close", (code) => {
			const out = Buffer.concat(chunks).toString("utf-8");
			const err = Buffer.concat(errChunks).toString("utf-8");
			if (code === 0 || (code === null && out.length > 0)) {
				resolve(out);
			} else {
				reject(new Error(err.trim() || `pi exited with code ${code}`));
			}
		});

		proc.on("error", (err) => reject(err));

		if (signal) {
			if (signal.aborted) {
				proc.kill("SIGTERM");
				reject(new DOMException("Aborted", "AbortError"));
				return;
			}
			signal.addEventListener(
				"abort",
				() => {
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 3000);
				},
				{ once: true },
			);
		}
	});
}

/**
 * 从 JSON 模式输出中提取最终 assistant 回答。
 */
function extractResponse(jsonOutput: string): BtwResult | null {
	const lines = jsonOutput.split("\n").filter((l) => l.trim());
	let lastText = "";
	let model: string | undefined;
	let usage: UsageInfo | undefined;

	for (const line of lines) {
		try {
			const event = JSON.parse(line);
			if (event.type === "message_end" && event.message?.role === "assistant") {
				for (const part of event.message.content || []) {
					if (part.type === "text" && part.text) lastText = part.text;
				}
				if (event.message.model) model = event.message.model;
				if (event.message.usage) {
					usage = {
						input: event.message.usage.input || 0,
						output: event.message.usage.output || 0,
						cost: event.message.usage.cost?.total || 0,
					};
				}
			}
		} catch {
			// 非 JSON 行忽略
		}
	}

	if (!lastText) return null;
	return { question: "", answer: lastText, model, usage };
}

/**
 * 将 prompt 写入临时文件。
 */
async function writePromptFile(context: string, question: string): Promise<{ dir: string; path: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-btw-"));
	const filePath = path.join(tmpDir, "btw-prompt.md");
	const content = [
		SUBAGENT_SYSTEM_PROMPT,
		"",
		"=== CONVERSATION HISTORY ===",
		context,
		"",
		"=== SIDE QUESTION ===",
		question,
	].join("\n");
	await fs.promises.writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 });
	return { dir: tmpDir, path: filePath };
}

function cleanupTemp(dir: string, file: string): void {
	try { fs.unlinkSync(file); } catch { /* ignore */ }
	try { fs.rmdirSync(dir); } catch { /* ignore */ }
}

// ─── 格式化工具 ──────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1000000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1000000).toFixed(1)}M`;
}

/**
 * 自动换行：将文本按 maxWidth 拆分为多行。
 * 按单词边界拆分，中文字符按双倍宽度计算。
 */
function wordWrap(text: string, maxWidth: number): string[] {
	if (!text) return [""];

	// 先按换行符拆分段落
	const paragraphs = text.split("\n");
	const lines: string[] = [];

	for (const para of paragraphs) {
		if (para === "") {
			lines.push("");
			continue;
		}

		// 将单词和空白拆分，保留空白标记
		const tokens = para.split(/(\s+)/);
		let current = "";
		let currentWidth = 0;

		for (const token of tokens) {
			const tw = visibleWidth(token);
			if (currentWidth + tw > maxWidth && currentWidth > 0) {
				lines.push(current);
				current = token.trimStart();
				currentWidth = visibleWidth(current);
			} else {
				current += token;
				currentWidth += tw;
			}
		}

		if (current) lines.push(current);
	}

	return lines.length > 0 ? lines : [""];
}

// ─── TUI 浮层组件 ───────────────────────────────────────────────────────

/**
 * /btw 问答结果浮层 UI 组件。
 * 在终端中央渲染一个浮动面板，显示问题和回答，支持键盘关闭和滚动。
 */
class BtwOverlayComponent implements Focusable {
	readonly width = 76;

	/** Focusable 接口 — TUI 通过此属性设置焦点状态 */
	focused = false;

	private question: string;
	private answer: string;
	private model?: string;
	private usage?: UsageInfo;
	private done: (result: undefined) => void;
	private scrollOffset = 0;
	private maxVisibleLines = 14;

	constructor(
		question: string,
		answer: string,
		done: (result: undefined) => void,
		model?: string,
		usage?: UsageInfo,
	) {
		this.question = question;
		this.answer = answer;
		this.done = done;
		this.model = model;
		this.usage = usage;
	}

	handleInput(data: string): void {
		// 关闭浮层
		if (matchesKey(data, "escape") || matchesKey(data, "return") || data === " ") {
			this.done(undefined);
			return;
		}

		// 滚动
		if (matchesKey(data, "up")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
		} else if (matchesKey(data, "down")) {
			this.scrollOffset++;
		}
	}

	render(width: number): string[] {
		const w = Math.min(width, this.width);
		const innerW = w - 4; // 边框 + 左右边距
		const lines: string[] = [];

		const row = (content: string) => {
			const vis = visibleWidth(content);
			return `│ ${content}${" ".repeat(Math.max(0, innerW - vis))} │`;
		};

		// 边框
		lines.push(`╭${"─".repeat(w - 2)}╮`);
		lines.push(row(`💡  /btw`));
		lines.push(`├${"─".repeat(w - 2)}┤`);

		// 问题
		const qLines = wordWrap(`Q: ${this.question}`, innerW);
		for (const l of qLines) {
			lines.push(row(l));
		}
		lines.push(`├${"─".repeat(w - 2)}┤`);

		// 回答（分段，支持换行和滚动）
		const answerLines = this.answer.split("\n").flatMap((para) => wordWrap(para, innerW));
		const totalLines = answerLines.length;
		const maxScroll = Math.max(0, totalLines - this.maxVisibleLines);
		this.scrollOffset = Math.min(this.scrollOffset, maxScroll);

		const start = this.scrollOffset;
		const end = Math.min(start + this.maxVisibleLines, totalLines);

		// 上方滚动指示
		if (start > 0) {
			lines.push(row(`  \x1b[2m↑ ${start} more lines\x1b[22m`));
		}

		// 可见行
		for (let i = start; i < end; i++) {
			lines.push(row(answerLines[i]));
		}

		// 下方滚动指示
		if (end < totalLines) {
			const remaining = totalLines - end;
			lines.push(row(`  \x1b[2m↓ ${remaining} more lines\x1b[22m`));
		}

		// 如果输出的行数少于最大可见行数，用空白行垫高，让浮层有最小高度
		const contentLines = Math.min(totalLines - start, this.maxVisibleLines);
		const minContentLines = 5;
		const blankPadding = Math.max(0, minContentLines - contentLines);
		for (let i = 0; i < blankPadding; i++) {
			lines.push(row(""));
		}

		if (end === totalLines && blankPadding === 0 && contentLines < minContentLines) {
			// 已经用空白垫了
		}

		lines.push(`├${"─".repeat(w - 2)}┤`);

		// 底部信息栏
		const infoParts: string[] = [];
		if (this.model) infoParts.push(`\x1b[2mmodel: ${this.model}\x1b[22m`);
		if (this.usage) {
			infoParts.push(
				`\x1b[2m↑${fmtTokens(this.usage.input)} ↓${fmtTokens(this.usage.output)} $${this.usage.cost.toFixed(4)}\x1b[22m`,
			);
		}
		if (infoParts.length > 0) {
			lines.push(row(infoParts.join("  ")));
		}

		lines.push(row(`\x1b[2mSpace / Enter / Escape to dismiss\x1b[22m`));
		lines.push(`╰${"─".repeat(w - 2)}╯`);

		return lines;
	}

	invalidate(): void {}
	dispose(): void {}
}

// ─── 主入口 ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerCommand("btw", {
		description: "在不中断主对话的情况下快速提问（侧边问答）",
		argumentHint: "<question>",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const question = args?.trim();
			if (!question) {
				ctx.ui.notify("用法: /btw <你的问题>", "error");
				return;
			}

			// ── 1. 收集当前会话上下文 ──
			const context = buildConversationContext(ctx);

			// ── 2. 写入临时文件 ──
			let tmpDir = "";
			let tmpFile = "";
			try {
				const tmp = await writePromptFile(context, question);
				tmpDir = tmp.dir;
				tmpFile = tmp.path;
			} catch (err) {
				ctx.ui.notify(`无法创建临时文件: ${err instanceof Error ? err.message : String(err)}`, "error");
				return;
			}

			// ── 3. 显示加载提示 ──
			ctx.ui.setStatus("btw", "🤔 Thinking...");

			// ── 4. 调度子进程 ──
			const { command, baseArgs } = getPiInvocation();
			const piArgs = [
				...baseArgs,
				"--mode", "json",
				"-p",
				"--no-session",
				"--no-tools",
				"--no-extensions",
				"--no-skills",
				"--no-prompt-templates",
				"--no-themes",
				"--no-context-files",
				"--append-system-prompt", tmpFile,
				question,
			];

			let result: BtwResult | null = null;
			try {
				const output = await spawnPi([command, ...piArgs], ctx.cwd, ctx.signal);
				result = extractResponse(output);
				if (result) result.question = question;
			} catch (err) {
				ctx.ui.setStatus("btw", "");
				cleanupTemp(tmpDir, tmpFile);
				ctx.ui.notify(`/btw 失败: ${err instanceof Error ? err.message : String(err)}", "error`);
				return;
			} finally {
				cleanupTemp(tmpDir, tmpFile);
			}

			ctx.ui.setStatus("btw", "");

			if (!result || !result.answer) {
				ctx.ui.notify("/btw 未收到回答", "error");
				return;
			}

			// ── 5. 显示结果 ──
			// 5a. 终端输出（带格式的边框文本，确保用户一定看到）
			console.log("");
			console.log(`  ╭─ 💡 /btw ─────────────────────────────────────────`);
			const qLines = wordWrap(`Q: ${result.question}`, 56);
			for (const l of qLines) {
				console.log(`  │ ${l}`);
			}
			console.log(`  ├──────────────────────────────────────────────────`);
			for (const line of result.answer.split("\n")) {
				console.log(`  │ ${line}`);
			}
			if (result.model) {
				console.log(`  │`);
				console.log(`  │ \x1b[2mmodel: ${result.model}\x1b[22m`);
			}
			console.log(`  ╰──────────────────────────────────────────────────`);
			console.log("");

			// 5b. TUI 浮层（交互模式）
			if (ctx.hasUI) {
				await ctx.ui.custom<undefined>(
					(_tui, _theme, _keybindings, done) =>
						new BtwOverlayComponent(result!.question, result!.answer, done, result!.model, result!.usage),
					{ overlay: true },
				);
			}
		},
	});
}
