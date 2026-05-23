import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("copy-user", {
    description: "Copy the last user message to clipboard",
    handler: async (_args, ctx) => {
      const branch = ctx.sessionManager.getBranch();

      // Walk backward to find the last user message
      let lastUserText = "";
      for (let i = branch.length - 1; i >= 0; i--) {
        const entry = branch[i];
        if (entry.type !== "message") continue;
        const msg = (entry as any).message;
        if (!msg || msg.role !== "user") continue;

        const content = msg.content;
        // Only handle string content or text blocks (skip images)
        if (typeof content === "string") {
          lastUserText = content;
        } else if (Array.isArray(content)) {
          lastUserText = content
            .filter((c: any) => c.type === "text" && typeof c.text === "string")
            .map((c: any) => c.text)
            .join("\n");
        }
        break;
      }

      if (!lastUserText.trim()) {
        ctx.ui.notify("No user message found to copy", "warning");
        return;
      }

      try {
        execSync("pbcopy", { input: lastUserText, encoding: "utf-8" });
        ctx.ui.notify("✓ Copied last user message to clipboard", "info");
      } catch {
        ctx.ui.notify("Failed to copy to clipboard", "error");
      }
    },
  });
}
