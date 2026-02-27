import { randomUUID } from "node:crypto";
import { Gemini, InMemoryRunner, LlmAgent, isFinalResponse, stringifyContent } from "@google/adk";
import { parseJsonResponse } from "../../agent-orchestrator/src/adk/modelGateway.js";
import { STORYTELLER_SYSTEM_PROMPT, FOLKLORE_TEMPLATES, type FolkloreTradition } from "./prompts.js";
import { sessionStore } from "./sessionStore.js";
import { generateStory } from "./tools/storyGenerator.js";
import { browseCharacters, matchCharactersToLibrary } from "./tools/characterBrowser.js";
import { generateCharacter, approveAndCacheCharacter, buildGenerationRequest } from "./tools/characterGenerator.js";
import { illustrateScene } from "./tools/sceneIllustrator.js";
import { narrateText } from "./tools/audioNarrator.js";
import { compileAndRunPlay } from "./tools/playCompiler.js";
import type { AgentStreamMessage, ChatInboundMessage, ConversationSession } from "./types.js";
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
 * Build the ADK LlmAgent + InMemoryRunner for multi-turn conversation.
 * One runner is shared for all sessions (sessions are differentiated by userId).
 */
const createAdkRunner = (config: AgentConfig): InMemoryRunner => {
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

  const llm = new Gemini(llmOptions);

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
 * Parse a folklore tradition from agent text response.
 * Looks for keywords matching known traditions.
 */
const parseTraditionFromText = (text: string): FolkloreTradition | undefined => {
  const lower = text.toLowerCase();
  for (const tradition of Object.keys(FOLKLORE_TEMPLATES) as FolkloreTradition[]) {
    if (lower.includes(tradition.replace("_", " ")) || lower.includes(tradition)) {
      return tradition;
    }
  }

  return undefined;
};

/**
 * Main conversation handler: processes a user message and streams responses.
 *
 * This implements the 5-step conversational flow:
 * 1. Story concept + approval
 * 2. Show library characters first
 * 3. Generate new character if requested
 * 4. Per-character approval
 * 5. Final cast confirmation → compile_and_run_play
 *
 * @param userMessage - The user's chat message or approval response.
 * @param session - The current conversation session.
 * @param runner - The ADK InMemoryRunner instance.
 * @param onMessage - Callback for streaming messages to the client.
 * @param config - Agent configuration (GCP project, etc.).
 */
export const handleConversationTurn = async (
  userMessage: string,
  session: ConversationSession,
  runner: InMemoryRunner,
  onMessage: MessageHandler,
  config: AgentConfig = {}
): Promise<void> => {
  // Detect intent from user message.
  const lower = userMessage.toLowerCase();
  const isStoryRequest =
    lower.includes("tell me") ||
    lower.includes("story") ||
    lower.includes("chandam") ||
    lower.includes("panchatantra") ||
    lower.includes("tale") ||
    lower.includes("narrate");

  const isPlayRequest =
    lower.includes("let's go") ||
    lower.includes("play") ||
    lower.includes("perform") ||
    lower.includes("ready") ||
    lower.includes("show");

  const isGenerateCharRequest =
    lower.includes("generate") ||
    lower.includes("create") ||
    lower.includes("new character") ||
    lower.includes("doesn't look") ||
    lower.includes("doesn't fit");

  // Step 1: Story generation request.
  if (isStoryRequest && !session.currentStory) {
    onMessage({ type: "text", content: "Ah, wonderful! Let me weave a tale for you... 🎭" });

    try {
      const story = await generateStory(
        {
          userRequest: userMessage,
          tradition: parseTraditionFromText(userMessage)
        },
        {
          runJsonPrompt: async (prompt: string) => {
            const response = await sendToAdk(runner, session, prompt);
            return parseJsonResponse(response);
          }
        }
      );

      session.currentStory = story;

      // Stream story concept as text.
      onMessage({
        type: "text",
        content:
          `**${story.title}** — a ${story.tradition.replace("_", " ")} tale\n\n` +
          `${story.synopsis}\n\n` +
          (story.moral ? `*Moral: ${story.moral}*\n\n` : "") +
          `**Characters:**\n` +
          story.characters.map((c) => `- **${c.name}** (${c.archetype}): ${c.description}`).join("\n") +
          "\n\nShall I bring this to life?"
      });

      // Step 2: Show available library characters.
      const libraryMatches = matchCharactersToLibrary(story.characters);
      const availableCount = Array.from(libraryMatches.values()).filter(Boolean).length;

      let castingChoice: string;

      if (availableCount > 0) {
        const matchSummary = story.characters
          .map((char) => {
            const match = libraryMatches.get(char.charId);
            return match
              ? `- **${char.name}** → Library match: "${match.name}" [${match.archetype}]`
              : `- **${char.name}** → Needs to be generated`;
          })
          .join("\n");

        onMessage({
          type: "text",
          content:
            `I found these characters from our library that could work:\n\n${matchSummary}\n\n` +
            `Do any of these fit, or shall I create story-specific characters?`
        });

        // Send approval card and await the user's choice.
        const requestId = randomUUID();
        const choices = ["Use library characters", "Generate new characters", "Mix (some library, some new)"];
        onMessage({
          type: "approval_request",
          requestId,
          choices,
          context: "Character casting choice"
        });

        // Register the pending approval — resolves when user sends approval_response.
        castingChoice = await sessionStore.addPendingApproval(
          session.sessionId,
          requestId,
          "Character casting choice",
          choices
        );
      } else {
        onMessage({
          type: "text",
          content: "I don't have existing characters for this story. Shall I create them fresh?"
        });

        const requestId = randomUUID();
        const choices = ["Yes, generate characters", "Tell me a different story"];
        onMessage({
          type: "approval_request",
          requestId,
          choices,
          context: "Character generation approval"
        });

        castingChoice = await sessionStore.addPendingApproval(
          session.sessionId,
          requestId,
          "Character generation approval",
          choices
        );
      }

      // Handle casting choice.
      if (castingChoice === "Tell me a different story") {
        session.currentStory = undefined;
        onMessage({ type: "text", content: "Sure! What kind of story would you like?" });
        return;
      }

      if (castingChoice === "Use library characters") {
        // Auto-approve library matches keyed by charId.
        for (const [charId, asset] of libraryMatches) {
          if (asset) {
            session.approvedCharacters.set(charId, asset);
          }
        }
        onMessage({
          type: "text",
          content: `Characters set! Say "let's perform" when you're ready to start the story.`
        });
      } else {
        // "Generate new characters" or "Yes, generate characters" — prompt user to proceed.
        onMessage({
          type: "text",
          content:
            `I'll create custom characters for this story. ` +
            `Say "generate character" to create each one, or "let's perform" to start with placeholders.`
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onMessage({ type: "error", message: `Story generation failed: ${message}` });
    }

    return;
  }

  // Step 3: Play execution request.
  if (isPlayRequest && session.currentStory) {
    if (session.approvedCharacters.size === 0) {
      // Auto-use library characters if none were explicitly approved.
      // Key by charId so playCompiler can look up by story character role.
      if (session.currentStory) {
        const libraryMatches = matchCharactersToLibrary(session.currentStory.characters);
        for (const [charId, asset] of libraryMatches) {
          if (asset) {
            session.approvedCharacters.set(charId, asset);
          }
        }
      }
    }

    onMessage({
      type: "text",
      content: `The stage is set! Performing "${session.currentStory.title}" 🎭`
    });

    try {
      await compileAndRunPlay(
        {
          story: session.currentStory,
          approvedCharacters: session.approvedCharacters
        },
        {
          onMessage,
          beatDelayMs: 400,
          audioEnabled: !!config.gcpProject,
          imagesEnabled: !!config.gcpProject,
          gcpProject: config.gcpProject,
          gcpLocation: config.gcpLocation
        }
      );

      onMessage({
        type: "text",
        content: "The curtain falls. 🙏 Jai ho! Would you like another story?"
      });

      // Reset story state for next session.
      session.currentStory = undefined;
      session.approvedCharacters.clear();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onMessage({ type: "error", message: `Play execution failed: ${message}` });
    }

    return;
  }

  // Step 3 alternative: Generate new character on demand.
  if (isGenerateCharRequest && session.currentStory) {
    onMessage({ type: "text", content: "I'll create a custom character for this story..." });

    // Generate the first un-approved character from the story.
    const story = session.currentStory;
    const unapprovedChars = story.characters.filter(
      (c) => !Array.from(session.approvedCharacters.values()).some((a) => a.name === c.name)
    );

    if (unapprovedChars.length === 0) {
      onMessage({ type: "text", content: "All characters are already in your cast! Ready to perform?" });
      return;
    }

    const charToGenerate = unapprovedChars[0];

    try {
      const asset = await generateCharacter(
        buildGenerationRequest(charToGenerate, true),
        {
          gcpProject: config.gcpProject,
          gcpLocation: config.gcpLocation,
          stitchMcpAvailable: config.stitchMcpAvailable ?? false
        }
      );

      onMessage({
        type: "image",
        url: asset.previewUrl,
        caption: `${asset.name} (${asset.archetype})`
      });

      const requestId = randomUUID();
      const approvalChoices = ["Perfect! Add to cast", "Generate another variation", "Use library version"];
      onMessage({
        type: "approval_request",
        requestId,
        choices: approvalChoices,
        context: `Character approval: ${asset.name}`
      });

      // Register and await user's approval decision.
      const approvalChoice = await sessionStore.addPendingApproval(
        session.sessionId,
        requestId,
        `Character approval: ${asset.name}`,
        approvalChoices
      );

      if (approvalChoice === "Use library version") {
        // Fall back to library match for this character if available.
        const libraryMatches = matchCharactersToLibrary([charToGenerate]);
        const libraryAsset = libraryMatches.get(charToGenerate.charId);
        if (libraryAsset) {
          session.approvedCharacters.set(charToGenerate.charId, libraryAsset);
          onMessage({ type: "text", content: `Using library version of ${charToGenerate.name}.` });
        } else {
          // No library version — keep the generated one.
          session.approvedCharacters.set(charToGenerate.charId, asset);
          onMessage({ type: "text", content: `No library version found, keeping the generated character.` });
        }
      } else if (approvalChoice === "Generate another variation") {
        // Remove from approved so user can re-trigger generation.
        onMessage({ type: "text", content: `I'll generate another variation. Say "generate character" again.` });
      } else {
        // "Perfect! Add to cast" — store asset keyed by charId.
        session.approvedCharacters.set(charToGenerate.charId, asset);
        onMessage({ type: "text", content: `${asset.name} added to your cast! Say "generate character" for the next one, or "let's perform" to start.` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onMessage({ type: "error", message: `Character generation failed: ${message}` });
    }

    return;
  }

  // Default: Pass to ADK agent for conversational response.
  const agentResponse = await sendToAdk(runner, session, userMessage);
  onMessage({ type: "text", content: agentResponse });
};

/**
 * Factory: create the agent runner from environment variables.
 *
 * @param env - Environment variables (process.env or test overrides).
 * @returns Configured InMemoryRunner or undefined if no auth is available.
 */
export const createAgentFromEnv = (
  env: Record<string, string | undefined> = process.env
): InMemoryRunner | undefined => {
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

  return createAdkRunner({
    model,
    apiKey: hasApiKey ? apiKey : undefined,
    vertexai: hasVertexConfig,
    gcpProject,
    gcpLocation
  });
};
