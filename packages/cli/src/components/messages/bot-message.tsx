import prettyMs from "pretty-ms";
import { EmptyBorder } from "../border";
import { useTheme } from "../../providers/theme";
import type { Message } from "../../hooks/use-chat";
import { Mode, type ModeType } from "@thinktocode/shared";
import { TextAttributes } from "@opentui/core";

type ClientMessagePart = Message["parts"][number];
type ToolPart = Extract<ClientMessagePart, { type: `tool-${string}` | "dynamic-tool" }>;

type Props = {
  parts: ClientMessagePart[];
  model: string;
  mode: ModeType;
  durationMs?: number;
  streaming?: boolean;
};

function formatToolName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function isToolPart(part: ClientMessagePart): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function getToolDisplay(
  toolName: string,
  input: unknown,
): { prefix: string; detail: string; isBash: boolean } {
  if (toolName === "bash") {
    let cmd = "";
    if (input && typeof input === "object" && "command" in input) {
      cmd = String((input as { command: unknown }).command || "");
    } else if (typeof input === "string") {
      cmd = input;
    }
    return {
      prefix: "$",
      detail: cmd,
      isBash: true,
    };
  }

  if (toolName === "readFile") {
    const p = (input as { path?: string })?.path || "";
    return { prefix: "Read", detail: p, isBash: false };
  }

  if (toolName === "writeFile") {
    const p = (input as { path?: string })?.path || "";
    return { prefix: "Write", detail: p, isBash: false };
  }

  if (toolName === "editFile") {
    const p = (input as { path?: string })?.path || "";
    return { prefix: "Edit", detail: p, isBash: false };
  }

  if (toolName === "listDirectory") {
    const p = (input as { path?: string })?.path || ".";
    return { prefix: "List", detail: p, isBash: false };
  }

  if (toolName === "glob") {
    const p = (input as { pattern?: string })?.pattern || "";
    return { prefix: "Glob", detail: p, isBash: false };
  }

  if (toolName === "grep") {
    const pat = (input as { pattern?: string })?.pattern || "";
    const p = (input as { path?: string })?.path;
    return { prefix: "Grep", detail: p ? `"${pat}" in ${p}` : `"${pat}"`, isBash: false };
  }

  let genericArgs = "";
  if (input != null) {
    if (typeof input !== "object") {
      genericArgs = String(input);
    } else {
      genericArgs = Object.values(input).map(String).join(" ");
    }
  }

  return {
    prefix: formatToolName(toolName),
    detail: genericArgs,
    isBash: false,
  };
}

type PartGroup = {
  type: ClientMessagePart["type"];
  parts: ClientMessagePart[];
  key: string;
};

function groupConsecutiveParts(parts: ClientMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.type === part.type) {
      lastGroup.parts.push(part);
    } else {
      const key = isToolPart(part) ? `group-tc-${part.toolCallId}` : `group-${part.type}-${i}`;
      groups.push({ type: part.type, parts: [part], key });
    }
  }

  return groups;
}

export function BotMessage({
  parts,
  model,
  mode,
  durationMs,
  streaming = false,
}: Props) {
  const { colors } = useTheme();

  return (
    <box width="100%" alignItems="center">
      {groupConsecutiveParts(parts).map((group, i) => (
        <box key={group.key} width="100%" paddingTop={i === 0 ? 0 : 1}>
          {group.parts.map((part, j) => {
            if (part.type === "reasoning") {
              return (
                <box
                  key={`reasoning-${j}`}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <text attributes={TextAttributes.DIM}>
                    <em fg={colors.thinking}>Thinking:</em> {part.text}
                  </text>
                </box>
              );
            }

            if (isToolPart(part)) {
              const toolName =
                part.type === "dynamic-tool" ? part.toolName : part.type.slice("tool-".length);
              const { prefix, detail, isBash } = getToolDisplay(toolName, part.input);
              const isRunning =
                part.state !== "output-available" && part.state !== "output-error";
              const isError = part.state === "output-error";
              const isSuccess = part.state === "output-available";

              return (
                <box
                  key={part.toolCallId}
                  border={["left"]}
                  borderColor={
                    isError
                      ? colors.error
                      : isRunning
                        ? colors.thinking
                        : colors.thinkingBorder
                  }
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                  flexDirection="column"
                >
                  <box flexDirection="row" gap={1} alignItems="center">
                    {isBash ? (
                      <text attributes={TextAttributes.BOLD} fg={colors.primary}>
                        $
                      </text>
                    ) : (
                      <text attributes={TextAttributes.BOLD} fg={colors.info}>
                        {prefix}:
                      </text>
                    )}
                    <text fg={isBash ? colors.selection : undefined}>{detail}</text>
                    {isRunning && (
                      <text attributes={TextAttributes.DIM} fg={colors.thinking}>
                        …
                      </text>
                    )}
                    {isSuccess && (
                      <text attributes={TextAttributes.BOLD} fg={colors.success}>
                        ✓
                      </text>
                    )}
                    {isError && (
                      <text attributes={TextAttributes.BOLD} fg={colors.error}>
                        ✗
                      </text>
                    )}
                  </box>

                  {isError && part.errorText && (
                    <box paddingLeft={2} paddingTop={0}>
                      <text fg={colors.error} attributes={TextAttributes.DIM}>
                        {part.errorText}
                      </text>
                    </box>
                  )}
                </box>
              );
            }

            if (part.type === "text") {
              return (
                <box key={`text-${j}`} paddingX={3} width="100%">
                  <text>{part.text}</text>
                </box>
              );
            }

            return null;
          })}
        </box>
      ))}

      <box paddingX={3} paddingY={1} gap={1} width="100%">
        <box flexDirection="row" gap={2}>
          <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>◉</text>
          <box flexDirection="row" gap={1}>
            <text>{mode === Mode.PLAN ? "Plan" : "Build"}</text>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              ›
            </text>
            <text attributes={TextAttributes.DIM}>{model}</text>
            {durationMs != null && (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                  ›
                </text>
                <text attributes={TextAttributes.DIM}>{prettyMs(durationMs)}</text>
              </>
            )}
          </box>
        </box>
      </box>
    </box>
  );
}
