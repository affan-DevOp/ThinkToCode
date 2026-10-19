import { SUPPORTED_CHAT_MODELS } from "@thinktocode/shared";
import { 
  AgentsDialogContent,
  ModelsDialogContent,
  SessionsDialogContent,
  ThemeDialogContent,
} from "../dialogs";
import type { Command } from "./types";
import { performLogin } from "../../lib/oauth";
import { clearAuth } from "../../lib/auth";
import { openBillingPortal, openUpgradeCheckout } from "../../lib/upgrade";
import { checkpointManager } from "../../lib/checkpoints";
import { copyToClipboard } from "../../lib/clipboard";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Start a new conversation",
    value: "/new",
    action: (ctx) => {
      ctx.navigate("/");
    },
  },
  {
    name: "undo",
    description: "Revert last file change checkpoint",
    value: "/undo",
    action: (ctx) => {
      const result = checkpointManager.undo();
      if (result.success) {
        ctx.toast.show({
          variant: "success",
          message: `Reverted ${result.fileCount} file(s): ${result.revertedFiles.join(", ")}`,
        });
      } else {
        ctx.toast.show({
          variant: "info",
          message: result.message,
        });
      }
    },
  },
  {
    name: "repomap",
    description: "Analyze project semantic AST map and token budget",
    value: "/repomap",
    action: async (ctx) => {
      ctx.toast.show({ message: "Analyzing repository architecture..." });
      try {
        const { buildSemanticRepoMap } = await import("../../lib/repo-map");
        const map = await buildSemanticRepoMap(process.cwd(), { maxTokens: 1800 });
        ctx.toast.show({
          variant: "success",
          message: `Indexed ${map.totalFilesScanned} files (~${map.tokenEstimate} tokens, top ${map.topRankedFiles.length} files)`,
          duration: 6000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to generate repo map";
        ctx.toast.show({ variant: "error", message: msg });
      }
    },
  },
  {
    name: "agents",
    description: "Switch agents",
    value: "/agents",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Agent",
        children: <AgentsDialogContent currentMode={ctx.mode} onSelectMode={ctx.setMode} />,
      });
    },
  },
  {
    name: "models",
    description: "Select AI model for generation",
    value: "/models",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Model",
        children: (
          <ModelsDialogContent
            models={SUPPORTED_CHAT_MODELS.map((model) => model.id)}
            onSelectModel={ctx.setModel}
          />
        ),
      });
    },
  },
  {
    name: "sessions",
    description: "Browse past sessions",
    value: "/sessions",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Sessions",
        children: <SessionsDialogContent />,
      });
    },
  },
  {
    name: "theme",
    description: "Change color theme",
    value: "/theme",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Theme",
        children: <ThemeDialogContent />,
      });
    },
  },
  {
    name: "login",
    description: "Sign in with your browser",
    value: "/login",
    action: async (ctx) => {
      ctx.toast.show({ message: "Opening browser to sign in..." });

      try {
        await performLogin();
        ctx.toast.show({ variant: "success", message: "Signed in" });
      } catch (error) {
        const message = error instanceof Error 
          ? error.message 
          : "Sign in failed or timed out";

        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "logout",
    description: "Sign out of your account",
    value: "/logout",
    action: (ctx) => {
      clearAuth();
      ctx.toast.show({ variant: "success", message: "Signed out" });
    },
  },
  {
    name: "upgrade",
    description: "Buy more credits",
    value: "/upgrade",
    action: async (ctx) => {
      ctx.toast.show({ message: "Opening credits checkout..." });

      try {
        await openUpgradeCheckout();
        ctx.toast.show({
          variant: "success",
          message: "Checkout opened in browser",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to open checkout";
        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "usage",
    description: "Open billing portal in your browser",
    value: "/usage",
    action: async (ctx) => {
      ctx.toast.show({ message: "Opening billing portal..." });

      try {
        await openBillingPortal();
        ctx.toast.show({
          variant: "success",
          message: "Billing portal opened in browser",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to open billing portal";
        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "exit",
    description: "Quit the application",
    value: "/exit",
    action: (ctx) => {
      ctx.exit();
    },
  },
];
