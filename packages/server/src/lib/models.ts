import { anthropic } from "@ai-sdk/anthropic";
import { openai, createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  findSupportedChatModel,
  type SupportedChatModel,
  type SupportedChatModelId,
  type SupportedProvider,
} from "@thinktocode/shared";
import type { LanguageModel } from "ai";

type AnthropicModelId = Extract<SupportedChatModel, { provider: "anthropic" }>["id"];
type OpenAIModelId = Extract<SupportedChatModel, { provider: "openai" }>["id"];
type GoogleModelId = Extract<SupportedChatModel, { provider: "google" }>["id"];
type GroqModelId = Extract<SupportedChatModel, { provider: "groq" }>["id"];
type OpenRouterModelId = Extract<SupportedChatModel, { provider: "openrouter" }>["id"];

type ProviderOptions = NonNullable<Parameters<typeof import("ai").streamText>[0]["providerOptions"]>;

export type ResolvedModel = {
  model: LanguageModel;
  provider: SupportedProvider;
  modelId: SupportedChatModelId;
  providerOptions?: ProviderOptions;
};

const ANTHROPIC_PROVIDER_OPTIONS: Partial<Record<AnthropicModelId, ProviderOptions>> = {
  "claude-opus-4-6": {
    anthropic: {
      thinking: {
        type: "enabled",
        budgetTokens: 10000,
      },
    },
  },
  "claude-sonnet-4-6": {
    anthropic: {
      thinking: {
        type: "enabled",
        budgetTokens: 10000,
      },
    },
  },
};

const OPENAI_PROVIDER_OPTIONS: Partial<Record<OpenAIModelId, ProviderOptions>> = {
  "gpt-5.4": {
    openai: {
      thinking: {
        reasoningSummary: "detailed",
      },
    },
  },
};

function assertUnsupportedProvider(provider: never): never {
  throw new Error(`Unsupported provider: ${provider}`);
}

function resolveAnthropicModel(modelId: AnthropicModelId): ResolvedModel {
  return {
    model: anthropic(modelId),
    provider: "anthropic",
    modelId,
    providerOptions: ANTHROPIC_PROVIDER_OPTIONS[modelId],
  };
}

function resolveOpenAIModel(modelId: OpenAIModelId): ResolvedModel {
  return {
    model: openai(modelId),
    provider: "openai",
    modelId,
    providerOptions: OPENAI_PROVIDER_OPTIONS[modelId],
  };
}

function resolveGoogleModel(modelId: GoogleModelId): ResolvedModel {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const google = createGoogleGenerativeAI({
    apiKey,
  });

  return {
    model: google(modelId) as LanguageModel,
    provider: "google",
    modelId,
  };
}

function resolveGroqModel(modelId: GroqModelId): ResolvedModel {
  const apiKey = process.env.GROQ_API_KEY;
  const groq = createOpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey,
  });

  return {
    model: groq.chat(modelId) as LanguageModel,
    provider: "groq",
    modelId,
  };
}


function resolveOpenRouterModel(modelId: OpenRouterModelId): ResolvedModel {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      "HTTP-Referer": "https://thinktocode.dev",
      "X-Title": "ThinkToCode CLI",
    },
  });

  return {
    model: openrouter.chat(modelId) as LanguageModel,
    provider: "openrouter",
    modelId,
  };
}

function resolveSupportedChatModel(model: SupportedChatModel): ResolvedModel {
  const provider = model.provider;

  switch (provider) {
    case "anthropic":
      return resolveAnthropicModel(model.id);
    case "openai":
      return resolveOpenAIModel(model.id);
    case "google":
      return resolveGoogleModel(model.id);
    case "groq":
      return resolveGroqModel(model.id);
    case "openrouter":
      return resolveOpenRouterModel(model.id);
    default:
      return assertUnsupportedProvider(provider);
  }
}

export function isSupportedChatModel(modelId: string): modelId is SupportedChatModelId {
  return findSupportedChatModel(modelId) != null;
}

export function resolveChatModel(modelId: string): ResolvedModel {
  const model = findSupportedChatModel(modelId);
  if (!model) {
    throw new Error(`Unsupported model: ${modelId}`);
  }

  return resolveSupportedChatModel(model);
}
