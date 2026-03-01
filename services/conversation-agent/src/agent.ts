import { Gemini, InMemoryRunner, LlmAgent, isFinalResponse, stringifyContent } from "@google/adk";
import { parseJsonResponse, buildPromptForAttempt } from "../../agent-orchestrator/src/adk/modelGateway.js";
import { STORYTELLER_SYSTEM_PROMPT } from "./prompts.js";
import { TheatreOrchestrator } from "./agents/orchestrator.js";
import type { AgentStreamMessage, ConversationSession } from "./types.js";
import { STORY_AI_TOOLS } from "./adkTools.js";

type AgentConfig = {
  model?: string;
  apiKey?: string;
  vertexai?: boolean;
  gcpProject?: string;
  gcpLocation?: string;
  stitchMcpAvailable?: boolean;
};

type MessageHandler = (message: AgentStreamMessage) => void;

/**
 * Build Gemini LLM options from agent config.
 */
const buildLlmOptions = (config: AgentConfig): ConstructorParameters<typeof Gemini>[0] => {
  const model = config.model ?? "gemini-2.5-flash";
  const llmOptions: ConstructorParameters<typeof Gemini>[0] = { model };

  if (config.apiKey) {
    llmOptions.apiKey = config.apiKey;
  }

  if (config.vertexai && config.gcpProject && config.gcpLocation) {
    llmOptions.vertexai = true;
    llmOptions.project = config.gcpProject;
    llmOptions.location = config.gcpLocation;
  }

  return llmOptions;
};

/**
 * Build the ADK LlmAgent + InMemoryRunner for multi-turn conversation.
 * One runner is shared for all sessions (sessions are differentiated by userId).
 */
const createAdkRunner = (config: AgentConfig): InMemoryRunner => {
  const llm = new Gemini(buildLlmOptions(config));

  // Register tools so the LLM sees their schemas and can call them for
  // conversational turns. Streaming tools (generate_story, compile_play)
  // delegate execution back to the orchestration layer in handleConversationTurn.
  const agent = new LlmAgent({
    name: "story_ai_conversational_agent",
    model: llm,
    instruction: STORYTELLER_SYSTEM_PROMPT,
    tools: STORY_AI_TOOLS
  });

  return new InMemoryRunner({
    agent,
    appName: "story-ai-conversation"
  });
};

/**
 * Build a separate JSON-only gateway for structured generation calls.
 * This avoids routing through the conversational storyteller agent which
 * adds persona/commentary that breaks JSON parsing.
 */
const createJsonRunner = (config: AgentConfig): InMemoryRunner => {
  const llm = new Gemini(buildLlmOptions(config));

  const agent = new LlmAgent({
    name: "story_json_gateway",
    model: llm,
    instruction:
      "You are a JSON gateway. Return exactly one valid JSON object and no additional commentary. " +
      "Do not use markdown code fences. Do not add any explanation before or after the JSON."
  });

  return new InMemoryRunner({
    agent,
    appName: "story-ai-json-gateway"
  });
};

/**
 * Send a prompt to the JSON-only gateway and parse the JSON response.
 * Creates a fresh session per call to avoid conversational context leaking.
 */
const runJsonPrompt = async (
  jsonRunner: InMemoryRunner,
  prompt: string,
  maxAttempts = 3
): Promise<unknown> => {
  const userId = "story-ai-json";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await jsonRunner.sessionService.createSession({
      appName: "story-ai-json-gateway",
      userId
    });

    let finalText = "";

    for await (const event of jsonRunner.runAsync({
      userId,
      sessionId: session.id,
      newMessage: {
        role: "user",
        parts: [{ text: buildPromptForAttempt(prompt, attempt) }]
      }
    })) {
      if (isFinalResponse(event)) {
        const text = stringifyContent(event).trim();
        if (text.length > 0) {
          finalText = text;
        }
      }
    }

    if (!finalText) {
      if (attempt >= maxAttempts) throw new Error("Model returned an empty response");
      continue;
    }

    try {
      return parseJsonResponse(finalText);
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
    }
  }

  throw new Error("JSON gateway exhausted retries without producing JSON");
};

/**
 * Send a text message to the ADK agent and collect the response.
 *
 * Maintains the session across calls for multi-turn conversation.
 */
const sendToAdk = async (
  runner: InMemoryRunner,
  session: ConversationSession,
  userMessage: string
): Promise<string> => {
  const userId = session.userId;

  // Ensure the ADK session exists — create once, reuse across messages.
  if (!session.adkSessionId) {
    const adkSession = await runner.sessionService.createSession({
      appName: "story-ai-conversation",
      userId
    });

    session.adkSessionId = adkSession.id;
  }

  let finalText = "";

  for await (const event of runner.runAsync({
    userId,
    sessionId: session.adkSessionId,
    newMessage: {
      role: "user",
      parts: [{ text: userMessage }]
    }
  })) {
    if (isFinalResponse(event)) {
      const text = stringifyContent(event).trim();
      if (text.length > 0) {
        finalText = text;
      }
    }
  }

  return finalText;
};

/**
 * Main conversation handler — delegates to the TheatreOrchestrator state machine.
 *
 * Signature is unchanged so server.ts continues to call this identically.
 * The 443-line monolith is replaced by a 3-agent + state machine architecture:
 *   Sutradhar  — story generation
 *   Chitrakar  — character visuals
 *   Rangmanch  — play execution
 */
export const handleConversationTurn = async (
  userMessage: string,
  session: ConversationSession,
  runner: InMemoryRunner,
  onMessage: MessageHandler,
  config: AgentConfig = {},
  jsonRunner?: InMemoryRunner
): Promise<void> => {
  const orchestrator = new TheatreOrchestrator(runner, jsonRunner ?? runner, config);

  await orchestrator.handleTurn(
    userMessage,
    session,
    onMessage,
    (s, msg) => sendToAdk(runner, s, msg),
    (prompt) => jsonRunner
      ? runJsonPrompt(jsonRunner, prompt)
      : sendToAdk(runner, session, prompt).then((r) => {
          try { return parseJsonResponse(r); } catch { return r; }
        })
  );
};

type AgentRunners = {
  conversational: InMemoryRunner;
  json: InMemoryRunner;
};

/**
 * Factory: create both the conversational and JSON gateway runners
 * from environment variables.
 *
 * @param env - Environment variables (process.env or test overrides).
 * @returns Configured runners or undefined if no auth is available.
 */
export const createAgentFromEnv = (
  env: Record<string, string | undefined> = process.env
): AgentRunners | undefined => {
  const model = env.AGENTIC_MODEL?.trim() ?? "gemini-2.5-flash";
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENAI_API_KEY ?? env.GOOGLE_API_KEY;
  const vertexai = env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase() === "true";
  const gcpProject = env.GOOGLE_CLOUD_PROJECT?.trim();
  const gcpLocation = env.GOOGLE_CLOUD_LOCATION?.trim();

  const hasVertexConfig = vertexai && gcpProject !== undefined && gcpLocation !== undefined;
  const hasApiKey = apiKey !== undefined && apiKey.trim().length > 0;

  if (!hasVertexConfig && !hasApiKey) {
    return undefined;
  }

  const config: AgentConfig = {
    model,
    apiKey: hasApiKey ? apiKey : undefined,
    vertexai: hasVertexConfig,
    gcpProject,
    gcpLocation
  };

  return {
    conversational: createAdkRunner(config),
    json: createJsonRunner(config)
  };
};
