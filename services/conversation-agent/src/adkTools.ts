/**
 * ADK FunctionTool definitions for the Story AI conversational agent.
 *
 * These tools are registered on the LlmAgent so the LLM:
 *   1. Sees the tool schemas and doesn't hallucinate imaginary tool calls.
 *   2. Can call non-streaming tools (browse_available_characters) directly via ADK.
 *   3. Declares intent for streaming tools (generate_story_concept,
 *      generate_character_asset, compile_and_run_play) — the orchestration layer
 *      in handleConversationTurn handles the actual streaming execution and
 *      approval flows for these.
 *
 * Architecture note: streaming tools return structured intent objects to the LLM.
 * The primary execution path is the orchestration layer in agent.ts which handles
 * multi-step approval flows and WebSocket streaming. The ADK runner uses these tools
 * for conversational turns outside the orchestration conditions.
 */
import type { Schema } from "@google/genai";
import { FunctionTool } from "@google/adk";
import { browseCharacters } from "./tools/characterBrowser.js";

// Utility: Schema uses `unknown` for execute input — cast to typed object.
// Each tool validates the cast is safe within its own context.
type BrowseParams = { archetype?: string; tradition?: string; query?: string };
type StoryParams = { userRequest: string; tradition?: string };
type CharParams = { charId: string; name: string; archetype: string; description?: string; needsParts?: boolean };
type PlayParams = { confirmed?: boolean };

/**
 * Tool: browse_available_characters
 * Fully functional — returns character library contents to the LLM.
 */
export const browseCharactersTool = new FunctionTool({
  name: "browse_available_characters",
  description:
    "Browse the pre-generated character library for Indian folklore puppet characters. " +
    "Returns available characters with their names, archetypes, and asset IDs. " +
    "Always call this before suggesting character generation to check if a suitable character already exists.",
  parameters: {
    type: "object",
    properties: {
      archetype: {
        type: "string",
        description: "Filter by archetype (hero, villain, trickster, mentor, animal_companion, deity)"
      },
      tradition: {
        type: "string",
        description: "Filter by folklore tradition (chandamama, panchatantra, vikram_betaal, tenali_raman, regional)"
      },
      query: {
        type: "string",
        description: "Free-text search against character names and descriptions"
      }
    }
  } as Schema,
  execute: (input: unknown) => {
    const { archetype, tradition, query } = (input ?? {}) as BrowseParams;
    const result = browseCharacters({ archetype, tradition, query });
    return {
      found: result.found.map((c) => ({
        assetId: c.assetId,
        name: c.name,
        archetype: c.archetype,
        hasParts: c.hasParts,
        source: c.source
      })),
      total: result.total,
      hasMore: result.hasMore
    };
  }
});

/**
 * Tool: generate_story_concept
 * Declares intent — actual generation is handled by the orchestration layer.
 */
export const generateStoryTool = new FunctionTool({
  name: "generate_story_concept",
  description:
    "Generate a complete Indian folklore story with NatyaScript screenplay. " +
    "Includes title, synopsis, characters, moral, and an animated puppet script. " +
    "After calling this, present the story concept to the user and ask for approval.",
  parameters: {
    type: "object",
    required: ["userRequest"],
    properties: {
      userRequest: {
        type: "string",
        description: "The user's story request, including any tradition preference"
      },
      tradition: {
        type: "string",
        description: "Folklore tradition (chandamama, panchatantra, vikram_betaal, tenali_raman, regional)"
      }
    }
  } as Schema,
  execute: (input: unknown) => {
    // Reason: Story generation requires the ADK runner for Gemini calls and a streaming
    // onMessage callback. The orchestration layer in handleConversationTurn handles this
    // when it detects a story request (isStoryRequest condition). This tool definition
    // exists so the LLM sees the correct schema.
    const { userRequest = "", tradition } = (input ?? {}) as StoryParams;
    return {
      status: "delegated_to_orchestrator",
      message:
        `Story generation requested for: "${userRequest}"` +
        (tradition ? ` (tradition: ${tradition})` : "") +
        ". The orchestration layer will handle streaming, character matching, and approval flows.",
      userRequest,
      tradition: tradition ?? null
    };
  }
});

/**
 * Tool: generate_character_asset
 * Declares intent — actual generation with approval flow is handled by the orchestration layer.
 */
export const generateCharacterTool = new FunctionTool({
  name: "generate_character_asset",
  description:
    "Generate a new puppet character asset for the story. " +
    "Only call this after browsing the library and confirming no suitable character exists, " +
    "and after the user has approved character generation.",
  parameters: {
    type: "object",
    required: ["charId", "name", "archetype", "description"],
    properties: {
      charId: { type: "string", description: "The character's story role ID (e.g. c_hero, c_villain)" },
      name: { type: "string", description: "Character name" },
      archetype: { type: "string", description: "Character archetype (hero, villain, trickster, etc.)" },
      description: { type: "string", description: "Physical and personality description" },
      needsParts: {
        type: "boolean",
        description: "True if the character needs puppet parts for animation (default: true)"
      }
    }
  } as Schema,
  execute: (input: unknown) => {
    // Reason: Character generation requires provider routing (Stitch/Vertex AI/SVG),
    // an approval flow with WebSocket callbacks, and session state updates.
    // The orchestration layer handles all of this via the isGenerateCharRequest path.
    const { charId = "", name = "", archetype = "" } = (input ?? {}) as CharParams;
    return {
      status: "delegated_to_orchestrator",
      message:
        `Character generation requested for ${name} (${archetype}, charId: ${charId}). ` +
        "The orchestration layer will handle provider routing, image generation, and per-character approval.",
      charId,
      name,
      archetype
    };
  }
});

/**
 * Tool: compile_and_run_play
 * Declares intent — actual play execution with streaming is handled by the orchestration layer.
 */
export const compileTool = new FunctionTool({
  name: "compile_and_run_play",
  description:
    "Compile the NatyaScript and run the puppet play with all approved characters. " +
    "Call this only after the user has confirmed the final cast. " +
    "Streams stage commands, narration audio, scene illustrations, and play frame events.",
  parameters: {
    type: "object",
    properties: {
      confirmed: {
        type: "boolean",
        description: "Set to true to confirm the user has approved the cast and is ready to start"
      }
    }
  } as Schema,
  execute: (input: unknown) => {
    // Reason: Play execution streams stage_command, audio, image, and play_frame events
    // over WebSocket in real time. The orchestration layer handles this via the
    // isPlayRequest condition in handleConversationTurn.
    const { confirmed } = (input ?? {}) as PlayParams;
    return {
      status: "delegated_to_orchestrator",
      message: confirmed
        ? "Play execution requested. The orchestration layer will compile the NatyaScript and stream the performance."
        : "Please confirm the cast is approved before starting the play.",
      confirmed: confirmed ?? false
    };
  }
});

/** All story AI tools — register these on the LlmAgent. */
export const STORY_AI_TOOLS = [
  browseCharactersTool,
  generateStoryTool,
  generateCharacterTool,
  compileTool
];
