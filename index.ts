import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const MAX_LABEL_WIDTH = 60;

type LabelContext = Pick<ExtensionContext, "hasUI" | "ui">;

function normalizeName(name: string | undefined): string | undefined {
	const normalized = name
		?.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
	return normalized || undefined;
}

function notify(ctx: LabelContext, message: string, level: "info" | "warning" | "error" = "info") {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

class SessionNameEditor extends CustomEditor {
	#sessionName: string | undefined;

	constructor(...args: ConstructorParameters<typeof CustomEditor>) {
		super(...args);
	}

	setSessionName(name: string | undefined): void {
		const nextName = normalizeName(name);
		if (this.#sessionName === nextName) return;
		this.#sessionName = nextName;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (!this.#sessionName || lines.length === 0 || width < 4) {
			return lines;
		}

		const topBorder = lines[0];
		if (!topBorder || topBorder.includes("↑") || visibleWidth(topBorder) !== width) {
			return lines;
		}

		lines[0] = this.#renderTopBorder(width);
		return lines;
	}

	#renderTopBorder(width: number): string {
		const maxNameWidth = Math.max(1, Math.min(MAX_LABEL_WIDTH, width - 2));
		const name = truncateToWidth(this.#sessionName ?? "", maxNameWidth, "…");
		const label = ` ${name} `;
		const labelWidth = visibleWidth(label);
		const fillWidth = Math.max(0, width - labelWidth);

		if (fillWidth === 0) {
			return this.borderColor(truncateToWidth(label, width, ""));
		}

		return this.borderColor("─".repeat(fillWidth)) + this.borderColor(label);
	}
}

export default function (pi: ExtensionAPI) {
	let visible = true;
	let editor: SessionNameEditor | undefined;

	function refresh(ctx: LabelContext): void {
		if (!ctx.hasUI) return;
		editor?.setSessionName(visible ? pi.getSessionName() : undefined);
	}

	function installEditor(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;

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

			if (command === "on" || command === "show") {
				visible = true;
				refresh(ctx);
				notify(ctx, "Session name border label enabled.");
				return;
			}

			if (command === "off" || command === "hide") {
				visible = false;
				refresh(ctx);
				notify(ctx, "Session name border label hidden.");
				return;
			}

			if (command === "refresh") {
				refresh(ctx);
				notify(ctx, "Session name border label refreshed.");
				return;
			}

			if (command && command !== "toggle") {
				notify(ctx, "Usage: /session-name-status [on|off|toggle|refresh]", "warning");
				return;
			}

			visible = !visible;
			refresh(ctx);
			notify(ctx, visible ? "Session name border label enabled." : "Session name border label hidden.");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		installEditor(ctx);
		refresh(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("message_end", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("session_shutdown", async () => {
		editor?.setSessionName(undefined);
		editor = undefined;
	});
}
