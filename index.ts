import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const STATUS_KEY = "session-name";
const POLL_INTERVAL_MS = 1_000;
const MAX_STATUS_WIDTH = 60;

type StatusContext = Pick<ExtensionContext, "hasUI" | "ui">;

function normalizeName(name: string | undefined): string | undefined {
  const normalized = name
    ?.replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
  return normalized || undefined;
}

function notify(ctx: StatusContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
  }
}

export default function (pi: ExtensionAPI) {
  let visible = true;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let lastStatusText: string | undefined;

  function buildStatus(ctx: StatusContext): string | undefined {
    if (!visible) return undefined;

    const sessionName = normalizeName(pi.getSessionName());
    if (!sessionName) return undefined;

    const theme = ctx.ui.theme;
    const prefix = theme.fg("dim", "name: ");
    const availableNameWidth = Math.max(1, MAX_STATUS_WIDTH - "name: ".length);
    const name = theme.fg("accent", truncateToWidth(sessionName, availableNameWidth, "…"));
    return prefix + name;
  }

  function refresh(ctx: StatusContext, force = false): void {
    if (!ctx.hasUI) return;

    const nextStatusText = buildStatus(ctx);
    if (force || nextStatusText !== lastStatusText) {
      ctx.ui.setStatus(STATUS_KEY, nextStatusText);
      lastStatusText = nextStatusText;
    }
  }

  function stopPolling(ctx?: StatusContext): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }

    if (ctx?.hasUI) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      lastStatusText = undefined;
    }
  }

  function startPolling(ctx: ExtensionContext): void {
    stopPolling();
    refresh(ctx, true);

    if (!ctx.hasUI) return;

    pollTimer = setInterval(() => {
      refresh(ctx);
    }, POLL_INTERVAL_MS);
  }

  pi.registerCommand("session-name-status", {
    description: "Toggle or refresh the session name statusline item",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();

      if (command === "on" || command === "show") {
        visible = true;
        refresh(ctx, true);
        notify(ctx, "Session name status enabled.");
        return;
      }

      if (command === "off" || command === "hide") {
        visible = false;
        refresh(ctx, true);
        notify(ctx, "Session name status hidden.");
        return;
      }

      if (command === "refresh") {
        refresh(ctx, true);
        notify(ctx, "Session name status refreshed.");
        return;
      }

      if (command && command !== "toggle") {
        notify(ctx, "Usage: /session-name-status [on|off|toggle|refresh]", "warning");
        return;
      }

      visible = !visible;
      refresh(ctx, true);
      notify(ctx, visible ? "Session name status enabled." : "Session name status hidden.");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    startPolling(ctx);
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

  pi.on("session_shutdown", async (_event, ctx) => {
    stopPolling(ctx);
  });
}
