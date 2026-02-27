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
  | { type: "error"; message: string }
  /**
   * Thinking indicator — emitted before long-running operations to show progress.
   * Clear by emitting with stage: "" when the operation is complete.
   */
  | { type: "thinking"; stage: string }
  /**
   * AI-generated scene backdrop image for the canvas stage.
   * Emitted when a SCENE_OPEN beat generates an illustration.
   */
  | { type: "scene_backdrop"; sceneId: string; imageUrl: string; setting: string }
  /**
   * Character portrait image for a cast member.
   * Emitted before play compilation for each approved character.
   * Optional parts contain separate body-part images for articulated puppet animation.
   */
  | { type: "character_portrait"; charId: string; name: string; imageUrl: string; parts?: { head: string; torso: string; leftArm: string; rightArm: string; leftLeg: string; rightLeg: string } };

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
  /** Separate body-part image URLs for articulated puppet animation. */
  parts?: { head: string; torso: string; leftArm: string; rightArm: string; leftLeg: string; rightLeg: string };
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
