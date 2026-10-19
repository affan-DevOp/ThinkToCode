export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

export type SupportedProvider = "anthropic" | "openai" | "google" | "groq" | "openrouter";

type SupportedChatModelDefinition = {
  id: string;
  provider: SupportedProvider;
  pricing: ModelPricing;
};

export const SUPPORTED_CHAT_MODELS = [
  // OpenRouter Free Models (Verified & 100% Free with $0 token cost)
  {
    id: "openrouter/free",
    provider: "openrouter",
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
    },
  },
  {
    id: "cohere/north-mini-code:free",
    provider: "openrouter",
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
    },
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    provider: "openrouter",
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
    },
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    provider: "openrouter",
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
    },
  },


  // Groq (Active models on Groq LPU, verified 200 OK & blazing fast)
  {
    id: "qwen/qwen3.8-27b",
    provider: "groq",
    pricing: {
      inputUsdPerMillionTokens: 0.15,
      outputUsdPerMillionTokens: 0.25,
    },
  },
  {
    id: "openai/gpt-oss-120b",
    provider: "groq",
    pricing: {
      inputUsdPerMillionTokens: 0.5,
      outputUsdPerMillionTokens: 0.8,
    },
  },
  {
    id: "openai/gpt-oss-20b",
    provider: "groq",
    pricing: {
      inputUsdPerMillionTokens: 0.1,
      outputUsdPerMillionTokens: 0.2,
    },
  },

  // Google Gemini (Free tier available & verified 200 OK)
  {
    id: "gemini-flash-latest",
    provider: "google",
    pricing: {
      inputUsdPerMillionTokens: 0.075,
      outputUsdPerMillionTokens: 0.3,
    },
  },
  {
    id: "gemini-3.8-flash",
    provider: "google",
    pricing: {
      inputUsdPerMillionTokens: 0.075,
      outputUsdPerMillionTokens: 0.3,
    },
  },
  {
    id: "gemini-3.5-flash",
    provider: "google",
    pricing: {
      inputUsdPerMillionTokens: 0.075,
      outputUsdPerMillionTokens: 0.3,
    },
  },

  // Anthropic
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15,
    },
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5,
    },
  },
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 5,
      outputUsdPerMillionTokens: 25,
    },
  },

  // OpenAI
  {
    id: "gpt-5.4",
    provider: "openai",
    pricing: {
      inputUsdPerMillionTokens: 2.5,
      outputUsdPerMillionTokens: 15,
    },
  },
  {
    id: "gpt-5.4-mini",
    provider: "openai",
    pricing: {
      inputUsdPerMillionTokens: 0.75,
      outputUsdPerMillionTokens: 4.5,
    },
  },
  {
    id: "gpt-5.4-nano",
    provider: "openai",
    pricing: {
      inputUsdPerMillionTokens: 0.2,
      outputUsdPerMillionTokens: 1.25,
    },
  },
] as const satisfies readonly SupportedChatModelDefinition[];

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string) {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

// Default to active blazing-fast Groq model
export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "qwen/qwen3.8-27b";
