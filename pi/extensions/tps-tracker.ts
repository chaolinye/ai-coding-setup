/**
 * TPS Tracker Extension
 *
 * Tracks tokens per second during model generation, reports
 * final TPS statistics at the end of each agent run.
 * Also tracks Time To First Token (TTFT) per turn.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	/** Timestamp when the current assistant message event started. Used as a fallback. */
	let messageStart: number | null = null;
	/** Timestamp of the first streamed output delta for the current assistant message. */
	let streamStart: number | null = null;
	/** Estimated streamed output tokens for live display before providers report final usage. */
	let estimatedStreamedTokens = 0;
	/** Cumulative official output tokens across all assistant messages in this agent run. */
	let totalOutputTokens = 0;
	/** Cumulative time (ms) spent actually streaming output deltas (excludes tool execution and first-token latency). */
	let totalStreamMs = 0;

	/** Timestamp of turn_start for the current turn. */
	let turnStart: number | null = null;
	/** All TTFT values (ms) collected in the current agent loop. */
	let ttftValues: number[] = [];
	/** The current TPS display string (without TTFT part), cached for re-combination. */
	let currentTPSDisplay = "";

	function formatTTFT(ms: number): string {
		if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
		return `${Math.round(ms)}ms`;
	}

	/** Returns up to 3 most recent TTFT values, newest first. */
	function recentTTFTs(): number[] {
		return ttftValues.slice(-3).reverse();
	}

	/**
	 * Builds the TTFT suffix for the status bar, e.g.
	 * "  |  TTFT 390ms  620ms  280ms"
	 * Returns empty string when there are no TTFT values yet.
	 */
	function statusTTFTPart(): string {
		if (ttftValues.length === 0) return "";
		const labels = recentTTFTs().map(formatTTFT).join("  ");
		return `  |  TTFT ${labels}`;
	}

	pi.on("agent_start", async (_event, ctx) => {
		totalOutputTokens = 0;
		totalStreamMs = 0;
		messageStart = null;
		streamStart = null;
		estimatedStreamedTokens = 0;
		turnStart = null;
		ttftValues = [];
		const theme = ctx.ui.theme;
		currentTPSDisplay = theme.fg("dim", "⏱ generating...");
		ctx.ui.setStatus("tps", currentTPSDisplay);
	});

	pi.on("turn_start", async (_event, ctx) => {
		turnStart = Date.now();
		// Hide TTFT while waiting for first token of this turn
		ctx.ui.setStatus("tps", currentTPSDisplay);
	});

	pi.on("message_start", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		messageStart = Date.now();
		streamStart = null;
		estimatedStreamedTokens = 0;

		// Compute TTFT for this turn
		if (turnStart !== null) {
			const ttft = Date.now() - turnStart;
			ttftValues.push(ttft);
		}

		// Show TTFT in status (TPS part unchanged)
		ctx.ui.setStatus("tps", currentTPSDisplay + statusTTFTPart());
	});

	pi.on("message_update", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		const streamEvent = event.assistantMessageEvent;
		const isOutputDelta =
			streamEvent.type === "text_delta" ||
			streamEvent.type === "thinking_delta" ||
			streamEvent.type === "toolcall_delta";

		if (!isOutputDelta) return;

		const now = Date.now();
		streamStart ??= now;
		estimatedStreamedTokens += Math.max(0, streamEvent.delta.length / 4);

		const elapsed = (now - streamStart) / 1000;
		const officialTokens = event.message.usage.output;
		const currentTokens = officialTokens > 0 ? officialTokens : estimatedStreamedTokens;

		if (elapsed > 0 && currentTokens > 0) {
			const tps = Math.round(currentTokens / elapsed);
			const tokenLabel = officialTokens > 0
				? `${officialTokens} tok`
				: `~${Math.round(estimatedStreamedTokens)} tok`;
			const theme = ctx.ui.theme;
			currentTPSDisplay = `${theme.fg("accent", `${tps} tok/s`)} ${theme.fg("dim", `(${tokenLabel} / ${elapsed.toFixed(1)}s)`)}`;
			ctx.ui.setStatus("tps", currentTPSDisplay + statusTTFTPart());
		}
	});

	pi.on("message_end", async (event) => {
		if (event.message.role !== "assistant") return;

		const messageTokens = event.message.usage.output;
		const timingStart = streamStart ?? messageStart;
		if (!timingStart || messageTokens <= 0) {
			messageStart = null;
			streamStart = null;
			estimatedStreamedTokens = 0;
			return;
		}

		totalOutputTokens += messageTokens;
		totalStreamMs += Math.max(0, Date.now() - timingStart);

		messageStart = null;
		streamStart = null;
		estimatedStreamedTokens = 0;
	});

	pi.on("agent_end", async (_event, ctx) => {
		const elapsed = totalStreamMs / 1000;
		const tps = totalOutputTokens > 0 && elapsed > 0 ? Math.round(totalOutputTokens / elapsed) : 0;

		const theme = ctx.ui.theme;
		const icon = theme.fg("success", "✓");
		const tpsLabel = tps > 0
			? theme.fg("accent", `${tps} tok/s`)
			: theme.fg("dim", "N/A");
		const detail = theme.fg("dim", `${totalOutputTokens} tokens in ${elapsed.toFixed(1)}s streaming`);

		let notifyText = `${icon} ${tpsLabel}  ${detail}`;

		// Append TTFT summary
		if (ttftValues.length > 0) {
			const avg = Math.round(ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length);
			const recentLabels = recentTTFTs().map(formatTTFT).join("  ");
			notifyText += `  ${theme.fg("accent", `⏱ TTFT avg ${formatTTFT(avg)}`)}  ${theme.fg("dim", `last ${recentLabels}`)}`;
		}

		ctx.ui.notify(notifyText, "info");

		currentTPSDisplay = theme.fg("dim", `done — ${tpsLabel}`);
		ctx.ui.setStatus("tps", currentTPSDisplay + statusTTFTPart());
	});
}  
