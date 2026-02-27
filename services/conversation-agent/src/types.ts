import type { RuntimeStageCommand } from "../../../apps/story-runtime/src/runtime.js";

/**
 * All message types the agent can stream to the viewer over WebSocket.
 * Each type maps to a distinct rendering mode in chatPanel.js.
 */
export type AgentStreamMessage =
  | { type: "text"; content: string }
  | { type: "image"; url: string; caption: string }
  | { type: "audio"; url: string; duration: number; beatNumber?: number }
  /**
   * Recorded video artifact (Phase 5 — not yet produced).
   *
   * Two production paths are planned:
   *   A. Client-side: browser MediaRecorder captures the canvas animation during
   *      play execution and synthesises a local blob: URL.
   *   B. Server-side: pre-rendered MP4 stored in GCS, URL emitted after play completes.
   *
   * The UI renderer in chatPanel.js already handles this type.
   * Neither producer is implemented; video production is deferred to Phase 5 (deploy/demo).
   */
  | { type: "video"; url: string; mimeType: "video/mp4"; sceneId: string }
  | { type: "stage_command"; command: RuntimeStageCommand }
  | { type: "approval_request"; requestId: string; choices: string[]; context: string }
  | { type: "play_start"; sceneId: string; storyTitle: string }
  | { type: "play_frame"; beat: number; sceneId: string }
  | { type: "error"; message: string };

/** Sent from the browser to the agent over WebSocket. */
export type ChatInboundMessage =
  | { type: "user_message"; content: string }
  | { type: "approval_response"; requestId: string; choice: string }
  | { type: "ping" };

/** Outbound message wrapper — always JSON-serializable. */
export type ChatOutboundMessage =
  | { type: "agent_stream"; payload: AgentStreamMessage }
  | { type: "pong" }
  | { type: "session_start"; sessionId: string };

/**
 * Result from the story generator tool.
 */
export type GeneratedStory = {
  storyId: string;
  title: string;
  tradition: string;
  synopsis: string;
  characters: Array<{
    charId: string;
    name: string;
    archetype: string;
    description: string;
  }>;
  natyaScript: string;
  moral?: string;
};

/**
 * Result from the character browser tool.
 */
export type CharacterAsset = {
  assetId: string;
  name: string;
  archetype: string;
  previewUrl: string;
  hasParts: boolean;
  source: "library" | "stitch" | "stub" | "svg" | "vertex_ai";
};

/**
 * Request sent to the character generation provider router.
 */
export type CharacterGenerationRequest = {
  charId: string;
  name: string;
  archetype: string;
  description: string;
  style?: string;
  /** If true, needs puppet parts (head/torso/limbs) — uses Stitch path. */
  needsParts: boolean;
};

/**
 * Result from character generation — may be puppet parts or full image.
 */
export type CharacterGenerationResult = {
  assetId: string;
  name: string;
  previewUrl: string;
  hasParts: boolean;
  parts?: Record<string, string>;
  source: "stitch_mcp" | "stitch_stub" | "svg_placeholder" | "vertex_ai";
};

/**
 * Pending approval state tracked in session.
 */
export type PendingApproval = {
  requestId: string;
  context: string;
  choices: string[];
  resolve: (choice: string) => void;
  reject: (reason: string) => void;
};

/**
 * Session state for a single user conversation.
 */
export type ConversationSession = {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastActiveAt: number;
  currentStory?: GeneratedStory;
  approvedCharacters: Map<string, CharacterAsset>;
  pendingApprovals: Map<string, PendingApproval>;
  adkSessionId?: string;
};
