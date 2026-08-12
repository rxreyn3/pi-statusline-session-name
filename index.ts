import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const MAX_LABEL_WIDTH = 60;
const ANSI_ESCAPE_PATTERN = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[PX^_][^\x1B]*(?:\x1B\\)|[@-Z\\-_])/g;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

type LabelContext = Pick<ExtensionContext, "hasUI" | "ui">;

function stripTerminalControlSequences(text: string): string {
	return text.replace(ANSI_ESCAPE_PATTERN, "").replace(CONTROL_CHARACTER_PATTERN, "");
}

function normalizeName(name: string | undefined): string | undefined {
	const normalized = name
		? stripTerminalControlSequences(name).replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim()
		: undefined;
	return normalized || undefined;
}

function isPlainHorizontalBorder(line: string, width: number): boolean {
	if (visibleWidth(line) !== width) return false;
	const visibleLine = stripTerminalControlSequences(line);
	return visibleLine.length > 0 && [...visibleLine].every((char) => char === "─");
}

function notify(ctx: LabelContext, message: string, level: "info" | "warning" | "error" = "info") {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

class SessionNameEditor extends CustomEditor {
	#sessionName: string | undefined;

	setSessionName(name: string | undefined): void {
		const nextName = normalizeName(name);
		if (this.#sessionName === nextName) return;
		this.#sessionName = nextName;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (!this.#sessionName || lines.length === 0 || width < 6) {
			return lines;
		}

		const topBorder = lines[0];
		if (!topBorder || !isPlainHorizontalBorder(topBorder, width)) {
			return lines;
		}

		lines[0] = this.#renderTopBorder(width);
		return lines;
	}

	#renderTopBorder(width: number): string {
		const maxNameWidth = Math.max(1, Math.min(MAX_LABEL_WIDTH, width - 3));
		const name = truncateToWidth(this.#sessionName!, maxNameWidth, "…");
		const label = ` ${name}`;
		const fillWidth = Math.max(1, width - visibleWidth(label));

		return this.borderColor("─".repeat(fillWidth) + label);
	}
}

export default function (pi: ExtensionAPI) {
	let visible = true;
	let editor: SessionNameEditor | undefined;
	let editorFactoryInstalled = false;

	function refresh(ctx: LabelContext): void {
		if (!ctx.hasUI) return;
		editor?.setSessionName(visible ? pi.getSessionName() : undefined);
	}

	function installEditor(ctx: LabelContext): void {
		if (!ctx.hasUI || editorFactoryInstalled) return;
		editorFactoryInstalled = true;

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			editor = new SessionNameEditor(tui, theme, keybindings);
			editor.setSessionName(visible ? pi.getSessionName() : undefined);
			return editor;
		});
	}

	pi.registerCommand("session-name-status", {
		description: "Toggle or refresh the session name editor-border label",
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();

			switch (command) {
				case "on":
				case "show":
					visible = true;
					refresh(ctx);
					notify(ctx, "Session name border label enabled.");
					return;
				case "off":
				case "hide":
					visible = false;
					refresh(ctx);
					notify(ctx, "Session name border label hidden.");
					return;
				case "refresh":
					refresh(ctx);
					notify(ctx, "Session name border label refreshed.");
					return;
				case "":
				case "toggle":
					visible = !visible;
					refresh(ctx);
					notify(ctx, visible ? "Session name border label enabled." : "Session name border label hidden.");
					return;
				default:
					notify(ctx, "Usage: /session-name-status [on|off|toggle|refresh]", "warning");
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		installEditor(ctx);
		refresh(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		refresh(ctx);
	});

	// These hooks are intentionally redundant: companion rename extensions may update
	// the session name during message_end or agent_end, and setSessionName(...) cheaply
	// short-circuits unchanged values when multiple lifecycle hooks fire in one turn.
	pi.on("message_end", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		refresh(ctx);
	});

	// session_info_changed is the event pi.setSessionName(...) emits, so a
	// rename extension (pi-session-title, pi-session-auto-rename, ...) is
	// reflected on the border the moment the name lands - no need to wait for
	// the next message/agent/turn lifecycle hook.
	pi.on("session_info_changed", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("session_shutdown", async () => {
		editor = undefined;
		editorFactoryInstalled = false;
	});
}
