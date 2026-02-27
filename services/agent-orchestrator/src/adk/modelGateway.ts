import { Gemini, InMemoryRunner, LlmAgent, isFinalResponse, stringifyContent } from "@google/adk";

const FENCED_JSON = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
const DEFAULT_MAX_JSON_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS = 200;

export const parseJsonResponse = (raw: string): unknown => {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to fenced JSON extraction.
  }

  FENCED_JSON.lastIndex = 0;
  let match = FENCED_JSON.exec(trimmed);

  while (match) {
    const candidate = match[1].trim();

    try {
      return JSON.parse(candidate);
    } catch {
      match = FENCED_JSON.exec(trimmed);
    }
  }

  throw new Error(`Invalid model JSON response: ${trimmed.slice(0, 200)}`);
};

export interface ModelGateway {
  runJsonPrompt(prompt: string): Promise<unknown>;
}

type EnvInput = Record<string, string | undefined>;

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const getModelEventError = (event: unknown): string | undefined => {
  if (!event || typeof event !== "object") {
    return undefined;
  }

  const record = event as Record<string, unknown>;
  const errorCode = toNonEmptyString(record.errorCode);
  const errorMessage = toNonEmptyString(record.errorMessage);

  if (!errorCode && !errorMessage) {
    return undefined;
  }

  if (errorCode && errorMessage) {
    return `Model returned error ${errorCode}: ${errorMessage}`;
  }

  return `Model returned error: ${errorCode ?? errorMessage}`;
};

export const shouldRetryModelGatewayError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (message.startsWith("invalid model json response:")) {
    return true;
  }

  if (message.includes("model returned an empty response")) {
    return true;
  }

  if (
    message.includes("model returned error 403") ||
    message.includes("model returned error 429") ||
    message.includes("model returned error 500") ||
    message.includes("model returned error 503")
  ) {
    return true;
  }

  if (
    message.includes("temporarily unavailable") ||
    message.includes("deadline") ||
    message.includes("timeout")
  ) {
    return true;
  }

  return false;
};

export const buildPromptForAttempt = (basePrompt: string, attempt: number): string => {
  if (attempt <= 1) {
    return basePrompt;
  }

  return [
    basePrompt,
    "IMPORTANT RETRY INSTRUCTION: your previous response was invalid.",
    "Return exactly one valid JSON object.",
    "Do not use markdown code fences.",
    "Do not include commentary, prefixes, or suffixes.",
    "Use double quotes for all JSON keys and string values."
  ].join("\n");
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const trimToUndefined = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseBooleanFlag = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === "true";

export const createModelGatewayFromEnv = (env: EnvInput = process.env): ModelGateway | undefined => {
  const model = trimToUndefined(env.AGENTIC_MODEL) ?? "gemini-2.5-flash";
  const apiKey =
    trimToUndefined(env.GEMINI_API_KEY) ??
    trimToUndefined(env.GOOGLE_GENAI_API_KEY) ??
    trimToUndefined(env.GOOGLE_API_KEY);
  const vertexEnabled = parseBooleanFlag(env.GOOGLE_GENAI_USE_VERTEXAI);
  const project = trimToUndefined(env.GOOGLE_CLOUD_PROJECT);
  const location = trimToUndefined(env.GOOGLE_CLOUD_LOCATION);
  const maxJsonAttempts = Math.max(
    1,
    Number.parseInt(trimToUndefined(env.MODEL_GATEWAY_MAX_JSON_ATTEMPTS) ?? "", 10) ||
      DEFAULT_MAX_JSON_ATTEMPTS
  );
  const retryBackoffMs = Math.max(
    1,
    Number.parseInt(trimToUndefined(env.MODEL_GATEWAY_RETRY_BACKOFF_MS) ?? "", 10) ||
      DEFAULT_RETRY_BACKOFF_MS
  );

  const hasVertexConfig = vertexEnabled && project !== undefined && location !== undefined;
  const hasApiKeyConfig = apiKey !== undefined;

  if (!hasVertexConfig && !hasApiKeyConfig) {
    return undefined;
  }

  const llm = new Gemini({
    model,
    ...(hasApiKeyConfig ? { apiKey } : {}),
    ...(hasVertexConfig
      ? {
          vertexai: true,
          project,
          location
        }
      : {})
  });

  const agent = new LlmAgent({
    name: "story_json_gateway",
    model: llm,
    instruction:
      "You are a JSON gateway. Return exactly one valid JSON object and no additional commentary."
  });

  const runner = new InMemoryRunner({
    agent,
    appName: "story-ai-orchestrator"
  });

  return {
    runJsonPrompt: async (prompt: string): Promise<unknown> => {
      const userId = "story-ai";

      for (let attempt = 1; attempt <= maxJsonAttempts; attempt += 1) {
        try {
          let finalText: string | undefined;
          const session = await runner.sessionService.createSession({
            appName: "story-ai-orchestrator",
            userId
          });

          for await (const event of runner.runAsync({
            userId,
            sessionId: session.id,
            newMessage: {
              role: "user",
              parts: [{ text: buildPromptForAttempt(prompt, attempt) }]
            }
          })) {
            const modelError = getModelEventError(event);
            if (modelError) {
              throw new Error(modelError);
            }

            if (isFinalResponse(event)) {
              const text = stringifyContent(event).trim();
              if (text.length > 0) {
                finalText = text;
              }
            }
          }

          if (!finalText) {
            throw new Error("Model returned an empty response");
          }

          return parseJsonResponse(finalText);
        } catch (error) {
          if (attempt >= maxJsonAttempts || !shouldRetryModelGatewayError(error)) {
            throw error;
          }

          await sleep(retryBackoffMs * attempt);
        }
      }

      throw new Error("Model gateway exhausted retries without producing JSON");
    }
  };
};
