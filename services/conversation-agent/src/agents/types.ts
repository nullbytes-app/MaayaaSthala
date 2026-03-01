import type { InMemoryRunner } from "@google/adk";
import type { AgentStreamMessage, ConversationSession, GeneratedStory, CharacterAsset } from "../types.js";

/**
 * Session state for the theatre crew state machine.
 * Tracks which phase of the storytelling flow the user is in.
 */
export type TheatreState = "IDLE" | "STORY_GENERATION" | "CASTING" | "PERFORMANCE";

/** Handler for streaming messages back to the client. */
export type MessageHandler = (message: AgentStreamMessage) => void;

/** Agent configuration — mirrors the internal AgentConfig in agent.ts. */
export type AgentConfig = {
  model?: string;
  apiKey?: string;
  vertexai?: boolean;
  gcpProject?: string;
  gcpLocation?: string;
  stitchMcpAvailable?: boolean;
};

/**
 * Shared dependencies injected into each theatre agent.
 * Agents must NOT import from each other — only from this shared interface.
 */
export type AgentDeps = {
  /** Run a prompt through the JSON-only gateway; returns parsed JSON. */
  runJsonPrompt: (prompt: string) => Promise<unknown>;
  /** Send a message to the ADK conversational agent; returns text response. */
  sendToAdk: (session: ConversationSession, userMessage: string) => Promise<string>;
  /** Agent configuration (GCP project, API key, etc.). */
  config: AgentConfig;
};

/**
 * Core contract for all three theatre agents (Sutradhar, Chitrakar, Rangmanch).
 * Each agent owns ONE clear objective, takes typed input, and returns typed output.
 */
export interface TheatreAgent<TInput, TResult> {
  readonly name: string;
  run(
    input: TInput,
    session: ConversationSession,
    onMessage: MessageHandler,
    deps: AgentDeps
  ): Promise<TResult>;
}

// ---------------------------------------------------------------------------
// Sutradhar (Director/Narrator) types
// ---------------------------------------------------------------------------

export type SutradharInput = {
  userMessage: string;
};

export type SutradharResult = {
  story: GeneratedStory;
  castingChoice: string;
} | null; // null = user rejected (chose "Tell me a different story")

// ---------------------------------------------------------------------------
// Chitrakar (Artist) types
// ---------------------------------------------------------------------------

export type ChitrakarMode =
  | { kind: "use_library"; story: GeneratedStory }
  | { kind: "batch_generate"; story: GeneratedStory }
  | { kind: "mix"; story: GeneratedStory }       // auto-approve library matches, generate only unmatched
  | { kind: "on_demand"; story: GeneratedStory };

export type ChitrakarInput = {
  mode: ChitrakarMode;
};

/** Map of charId → approved CharacterAsset */
export type ChitrakarResult = Map<string, CharacterAsset>;

// ---------------------------------------------------------------------------
// Rangmanch (Stage Manager) types
// ---------------------------------------------------------------------------

export type RangmanchInput = {
  story: GeneratedStory;
  approvedCharacters: Map<string, CharacterAsset>;
};
