import { useMemo } from "react";
import { useChat as useAiChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type InferUITools,
  type ToolSet,
  lastAssistantMessageIsCompleteWithToolCalls,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { 
  type ModeType, 
  type SupportedChatModelId, 
  type ToolContracts,
  toolInputSchemas,
} from "@thinktocode/shared";
import { apiClient } from "../lib/api-client";
import { getAuth } from "../lib/auth";
import { executeLocalTool } from "../lib/local-tools";
import { isDestructiveCommand } from "../lib/guardrails";
import { CircuitBreaker, type CircuitBreakerConfig } from "../lib/circuit-breaker";

export type ChatMessageMetadata = {
  mode?: ModeType;
  model?: SupportedChatModelId | string;
  durationMs?: number;
  usage?: LanguageModelUsage;
};

type ChatTools = {
  [Name in keyof InferUITools<ToolContracts & ToolSet>]: {
    input: InferUITools<ToolContracts & ToolSet>[Name]["input"];
    output: unknown;
  };
};

export type Message = UIMessage<ChatMessageMetadata, never, ChatTools>;

export type UseChatOptions = {
  requestBashApproval?: (command: string, reason?: string) => Promise<boolean>;
  onCircuitBreakerTripped?: (reason: string) => void;
  circuitBreakerConfig?: CircuitBreakerConfig;
};

export function useChat(
  sessionId: string,
  initialMessages: Message[],
  options?: UseChatOptions,
) {
  const circuitBreaker = useMemo(
    () => new CircuitBreaker(options?.circuitBreakerConfig),
    [options?.circuitBreakerConfig],
  );

  const transport = useMemo(() => {
    return new DefaultChatTransport<Message>({
      api: apiClient.chat.$url().toString(),
      headers() {
        const auth = getAuth();
        return auth ? { Authorization: `Bearer ${auth.token}` } : new Headers();
      },
      prepareSendMessagesRequest({ messages }) {
        const message = messages[messages.length - 1];
        if (!message) throw new Error("No message to send");

        const metadata = messages.findLast(
          (m) => m.metadata?.mode && m.metadata?.model,
        )?.metadata;
        const previousMessage = messages[messages.length - 2];
        const requestMessages =
          message.role === "assistant" && previousMessage?.role === "user"
            ? [previousMessage, message]
            : [message];

        return {
          body: {
            id: sessionId,
            messages: requestMessages,
            mode: message.metadata?.mode ?? metadata?.mode,
            model: message.metadata?.model ?? metadata?.model,
          },
        };
      },
    });
  }, [sessionId]);

  const chat = useAiChat<Message>({
    id: sessionId,
    messages: initialMessages,
    transport,
    onToolCall({ toolCall }) {
      const mode = chat.messages.at(-1)?.metadata?.mode ?? "BUILD";

      const run = async () => {
        // 1. Doom-Loop Circuit Breaker Guard
        const check = circuitBreaker.check(toolCall.toolName, toolCall.input);
        if (check.tripped) {
          options?.onCircuitBreakerTripped?.(check.reason ?? "Repetitive loop detected");
          throw new Error(
            `[CIRCUIT BREAKER TRIGGERED]: Execution halted because ${check.reason}. ` +
            `Please stop repeating this action, explain what went wrong to the user, and propose an alternative strategy or ask for clarification.`,
          );
        }

        // 2. Destructive Bash Command Guardrail
        if (toolCall.toolName === "bash") {
          let command = "";
          try {
            const parsed = toolInputSchemas.bash.parse(toolCall.input);
            command = parsed.command;
          } catch {
            // let executeLocalTool handle parsing error
          }

          if (command) {
            const check = isDestructiveCommand(command);
            if (check.isDestructive && options?.requestBashApproval) {
              const approved = await options.requestBashApproval(command, check.reason);
              if (!approved) {
                throw new Error(
                  `Command execution cancelled by user: "$ ${command}" (${check.reason ?? "Blocked by security guardrail"})`,
                );
              }
            }
          }
        }

        return await executeLocalTool(toolCall.toolName, toolCall.input, mode);
      };

      void run()
        .then((output) => {
          circuitBreaker.recordResult(toolCall.toolName, toolCall.input, true);
          return chat.addToolOutput({
            tool: toolCall.toolName as keyof ChatTools,
            toolCallId: toolCall.toolCallId,
            output,
          });
        })
        .catch((error) => {
          const errorMsg = error instanceof Error ? error.message : String(error);
          circuitBreaker.recordResult(toolCall.toolName, toolCall.input, false, errorMsg);
          return chat.addToolOutput({
            tool: toolCall.toolName as keyof ChatTools,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: errorMsg,
          });
        });
    },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    submit: (params: { userText: string; mode: ModeType; model: SupportedChatModelId }) => {
      circuitBreaker.reset();
      return chat.sendMessage({
        text: params.userText,
        metadata: {
          mode: params.mode,
          model: params.model,
        },
      });
    },
    abort: chat.stop,
    interrupt: chat.stop,
  };
}