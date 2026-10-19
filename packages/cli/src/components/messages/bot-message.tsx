import prettyMs from "pretty-ms";
import { EmptyBorder } from "../border";
import { useTheme } from "../../providers/theme";
import type { Message } from "../../hooks/use-chat";
import { Mode, type ModeType } from "@thinktocode/shared";
import { TextAttributes, SyntaxStyle } from "@opentui/core";

type ClientMessagePart = Message["parts"][number];
type ToolPart = Extract<ClientMessagePart, { type: `tool-${string}` | "dynamic-tool" }>;

type Props = {
  parts: ClientMessagePart[];
  model: string;
  mode: ModeType;
  durationMs?: number;
  streaming?: boolean;
};


let defaultSyntaxStyle: SyntaxStyle | null = null;
function getSyntaxStyle(): SyntaxStyle {
  if (!defaultSyntaxStyle) {
    try {
      defaultSyntaxStyle = SyntaxStyle.create();
    } catch {
      // Fallback if needed
    }
  }
  return defaultSyntaxStyle!;
}

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
    return { prefix: "Read File", detail: p, isBash: false };
  }

  if (toolName === "writeFile") {
    const p = (input as { path?: string })?.path || "";
    return { prefix: "Write File", detail: p, isBash: false };
  }

  if (toolName === "editFile") {
    const p = (input as { path?: string })?.path || "";
    return { prefix: "Edit File", detail: p, isBash: false };
  }

  if (toolName === "patchFile") {
    const p = (input as { path?: string })?.path || "";
    return { prefix: "Patch File", detail: p, isBash: false };
  }

  if (toolName === "listDirectory") {
    const p = (input as { path?: string })?.path || ".";
    return { prefix: "List Directory", detail: p, isBash: false };
  }

  if (toolName === "glob") {
    const pat = (input as { pattern?: string })?.pattern || "";
    const p = (input as { path?: string })?.path;
    return { prefix: "Glob", detail: p ? `${pat} ${p}` : `${pat} .`, isBash: false };
  }

  if (toolName === "grep") {
    const pat = (input as { pattern?: string })?.pattern || "";
    const p = (input as { path?: string })?.path;
    return { prefix: "Grep", detail: p ? `"${pat}" ${p}` : `"${pat}" .`, isBash: false };
  }

  if (toolName === "repoMap") {
    const q = (input as { query?: string })?.query;
    return { prefix: "Repo Map", detail: q ? `"${q}"` : ".", isBash: false };
  }

  if (toolName === "planSwarmDag") {
    const g = (input as { goal?: string })?.goal || "";
    return { prefix: "Plan Swarm Dag", detail: g, isBash: false };
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
  type: "text" | "reasoning" | "tools" | string;
  parts: ClientMessagePart[];
  key: string;
};

function groupConsecutiveParts(parts: ClientMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  const meaningfulParts = parts.filter(
    (part) => part.type !== "text" || Boolean((part as { text?: string }).text?.trim()),
  );

  for (let i = 0; i < meaningfulParts.length; i++) {
    const part = meaningfulParts[i]!;
    const isCurrentTool = isToolPart(part);
    const lastGroup = groups[groups.length - 1];
    const isLastTool = lastGroup && lastGroup.type === "tools";

    if (isCurrentTool && isLastTool) {
      lastGroup.parts.push(part);
    } else if (isCurrentTool) {
      groups.push({ type: "tools", parts: [part], key: `group-tools-${i}` });
    } else if (lastGroup && lastGroup.type === part.type) {
      lastGroup.parts.push(part);
    } else {
      groups.push({ type: part.type, parts: [part], key: `group-${part.type}-${i}` });
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
      {groupConsecutiveParts(parts).map((group, i) => {
        if (group.type === "reasoning") {
          return (
            <box
              key={group.key}
              border={["left"]}
              borderColor={colors.thinkingBorder}
              customBorderChars={{
                ...EmptyBorder,
                vertical: "\u2502",
              }}
              width="100%"
              paddingX={2}
              paddingTop={i === 0 ? 0 : 1}
            >
              {group.parts.map((p, j) => (
                <text key={`r-${j}`} attributes={TextAttributes.DIM}>
                  <em fg={colors.thinking}>Thinking:</em> {(p as { text?: string }).text}
                </text>
              ))}
            </box>
          );
        }

        if (group.type === "tools") {
          return (
            <box
              key={group.key}
              border={["left"]}
              borderColor={colors.thinkingBorder}
              customBorderChars={{
                ...EmptyBorder,
                vertical: "\u2502",
              }}
              width="100%"
              paddingX={2}
              paddingTop={i === 0 ? 0 : 1}
              flexDirection="column"
            >
              {group.parts.map((part) => {
                if (!isToolPart(part)) return null;
                const toolName =
                  part.type === "dynamic-tool" ? part.toolName : part.type.slice("tool-".length);
                const { prefix, detail, isBash } = getToolDisplay(toolName, part.input);
                const isError = part.state === "output-error";

                return (
                  <box key={part.toolCallId} flexDirection="column">
                    <box flexDirection="row" gap={1}>
                      {isBash ? (
                        <text attributes={TextAttributes.BOLD} fg={colors.primary}>
                          $
                        </text>
                      ) : (
                        <text attributes={TextAttributes.ITALIC} fg={isError ? colors.error : colors.info}>
                          {prefix}:
                        </text>
                      )}
                      <text>{detail}</text>
                      {isError && (
                        <text attributes={TextAttributes.BOLD} fg={colors.error}>
                          ✗
                        </text>
                      )}
                    </box>
                    {isError && part.errorText && (
                      <box paddingLeft={2}>
                        <text fg={colors.error} attributes={TextAttributes.DIM}>
                          {part.errorText}
                        </text>
                      </box>
                    )}
                  </box>
                );
              })}
            </box>
          );
        }

        if (group.type === "text") {
          const rawText = group.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { text?: string }).text || "")
            .join("");

          if (!rawText.trim()) return null;

          // Strip HTML breaks commonly output by LLMs in tables and lists
          const cleanText = rawText.replace(/<br\s*\/?>/gi, "\n");

          return (
            <box key={group.key} paddingX={3} width="100%" paddingTop={i === 0 ? 0 : 1}>
              <markdown
                content={cleanText}
                syntaxStyle={getSyntaxStyle()}
                streaming={streaming}
                tableOptions={{
                  style: "grid",
                  borders: true,
                  wrapMode: "word",
                  cellPadding: 1,
                }}
              />
            </box>
          );
        }

        return null;
      })}

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
