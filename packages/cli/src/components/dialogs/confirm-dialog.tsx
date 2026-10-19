import { useCallback, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import { useKeyboardLayer } from "../../providers/keyboard-layer";

type ConfirmBashDialogContentProps = {
  command: string;
  reason?: string;
  onConfirm: () => void;
  onReject: () => void;
};

export function ConfirmBashDialogContent({
  command,
  reason,
  onConfirm,
  onReject,
}: ConfirmBashDialogContentProps) {
  // 0: Cancel (safe default), 1: Execute
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { colors } = useTheme();
  const { isTopLayer } = useKeyboardLayer();

  const handleExecute = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    onReject();
  }, [onReject]);

  useKeyboard((key) => {
    if (!isTopLayer("dialog")) return;

    if (key.name === "y") {
      key.preventDefault();
      handleExecute();
    } else if (key.name === "n" || key.name === "escape") {
      key.preventDefault();
      handleCancel();
    } else if (key.name === "left" || key.name === "up" || key.name === "tab") {
      key.preventDefault();
      setSelectedIndex((i) => (i === 0 ? 1 : 0));
    } else if (key.name === "right" || key.name === "down") {
      key.preventDefault();
      setSelectedIndex((i) => (i === 0 ? 1 : 0));
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault();
      if (selectedIndex === 1) {
        handleExecute();
      } else {
        handleCancel();
      }
    }
  });

  return (
    <box flexDirection="column" gap={1} width="100%">
      <box flexDirection="row" gap={1} alignItems="center">
        <text fg={colors.error} attributes={TextAttributes.BOLD}>
          ⚠ WARNING:
        </text>
        <text attributes={TextAttributes.BOLD}>
          Destructive Command Detected
        </text>
      </box>

      {reason && (
        <text fg={colors.thinking} attributes={TextAttributes.DIM}>
          {reason}
        </text>
      )}

      {/* Command Preview Box */}
      <box
        backgroundColor={colors.surface}
        paddingX={2}
        paddingY={1}
        width="100%"
        flexDirection="column"
      >
        <box flexDirection="row" gap={1}>
          <text fg={colors.primary} attributes={TextAttributes.BOLD}>
            $
          </text>
          <text fg={colors.error} attributes={TextAttributes.BOLD}>
            {command}
          </text>
        </box>
      </box>

      <box paddingTop={1} flexDirection="column" gap={1}>
        <text attributes={TextAttributes.DIM}>
          Do you want to allow this command to run on your local machine?
        </text>

        <box flexDirection="row" gap={2} marginTop={1} justifyContent="flex-end">
          <box
            paddingX={2}
            backgroundColor={selectedIndex === 0 ? colors.selection : colors.surface}
            onMouseDown={handleCancel}
          >
            <text
              fg={selectedIndex === 0 ? "black" : colors.primary}
              attributes={selectedIndex === 0 ? TextAttributes.BOLD : undefined}
            >
              [N] Cancel (Esc)
            </text>
          </box>

          <box
            paddingX={2}
            backgroundColor={selectedIndex === 1 ? colors.error : colors.surface}
            onMouseDown={handleExecute}
          >
            <text
              fg={selectedIndex === 1 ? "white" : colors.error}
              attributes={selectedIndex === 1 ? TextAttributes.BOLD : undefined}
            >
              [Y] Execute Anyway
            </text>
          </box>
        </box>

        <text attributes={TextAttributes.DIM}>
          Tip: Press [Y] to approve, [N] or [Esc] to cancel.
        </text>
      </box>
    </box>
  );
}
