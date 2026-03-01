import type { InMemoryRunner } from "@google/adk";
import { parseJsonResponse } from "../../../agent-orchestrator/src/adk/modelGateway.js";
import { sutradhar } from "./sutradhar.js";
import { chitrakar } from "./chitrakar.js";
import { rangmanch } from "./rangmanch.js";
import type { ConversationSession } from "../types.js";
import type { TheatreState, AgentConfig, AgentDeps, MessageHandler } from "./types.js";

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

type Intent = "story_request" | "play_request" | "generate_char_request" | "conversation";

/**
 * Detect user intent from a message.
 * Returns a simple intent string — does NOT use LLM for routing (no latency overhead).
 *
 * Narrowed from the original monolith: "start" and "show" are removed from
 * play keywords because they cause false positives on natural story prompts
 * (e.g. "Show me a story about a lion").
 */
function detectIntent(userMessage: string): Intent {
  const lower = userMessage.toLowerCase();

  const isPlayRequest =
    lower.includes("let's go") ||
    lower.includes("lets go") ||
    lower.includes("let's perform") ||
    lower.includes("lets perform") ||
    lower.includes("perform") ||
    lower.includes("ready to perform") ||
    lower.includes("play the story") ||
    lower.includes("begin the play") ||
    lower.includes("start the play") ||
    lower.includes("begin performance");

  const isGenerateCharRequest =
    lower.includes("generate character") ||
    lower.includes("new character") ||
    lower.includes("doesn't look") ||
    lower.includes("doesn't fit") ||
    lower.includes("create character");

  const isStoryRequest =
    !isPlayRequest &&
    !isGenerateCharRequest &&
    (
      lower.includes("tell me") || lower.includes("story about") ||
      lower.includes("chandam") || lower.includes("panchatantra") ||
      lower.includes("tale") || lower.includes("narrate") ||
      lower.includes("tell a") || lower.includes("fable") ||
      lower.includes("story of") || lower.includes("a story") ||
      lower.includes("about a") || lower.includes("between a") ||
      /^(a |an |the |about |once upon)/i.test(userMessage.trim())
    );

  if (isPlayRequest) return "play_request";
  if (isGenerateCharRequest) return "generate_char_request";
  if (isStoryRequest) return "story_request";
  return "conversation";
}

/**
 * Fallback heuristic: if a message has 4+ words and no current story,
 * treat it as a story request.
 * Reason: users rarely type 4+ words without context when there's no active story.
 */
function isImpliedStoryRequest(userMessage: string, session: ConversationSession): boolean {
  return !session.currentStory && userMessage.trim().split(/\s+/).length >= 4;
}

// ---------------------------------------------------------------------------
// State-gated routing table
// ---------------------------------------------------------------------------

/**
 * Defines which intents are valid in each TheatreState.
 * Prevents routing that would be semantically invalid for the current phase.
 *
 * The state machine comment describes transitions; this table enforces them.
 * State transitions:
 *   IDLE            --[story_request]--> STORY_GENERATION
 *   STORY_GENERATION  (internal — approval loop running)
 *   CASTING         --[generate_char_request]--> CASTING (loop)
 *   CASTING         --[play_request]--> PERFORMANCE
 *   PERFORMANCE     (internal — play running; incoming turns are queued/rejected)
 *   Any state       --[new story_request]--> STORY_GENERATION (reset)
 */
const VALID_INTENTS_BY_STATE: Record<TheatreState, ReadonlySet<Intent>> = {
  IDLE: new Set(["story_request", "conversation"]),
  STORY_GENERATION: new Set(["story_request"]),       // only new-story reset is valid mid-generation
  CASTING: new Set(["generate_char_request", "play_request", "story_request", "conversation"]),
  PERFORMANCE: new Set([]),                             // no new turns during play execution
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * State machine orchestrator for the Theatre Crew multi-agent system.
 *
 * Responsibility: route user messages to the correct agent (Sutradhar, Chitrakar, Rangmanch)
 * using both intent detection AND session.state as primary routing guards.
 */
export class TheatreOrchestrator {
  private readonly adkRunner: InMemoryRunner;
  private readonly jsonRunner: InMemoryRunner;
  private readonly config: AgentConfig;

  constructor(adkRunner: InMemoryRunner, jsonRunner: InMemoryRunner, config: AgentConfig) {
    this.adkRunner = adkRunner;
    this.jsonRunner = jsonRunner;
    this.config = config;
  }

  /**
   * Route a user message to the appropriate agent based on intent and session state.
   * This is the single entry point replacing handleConversationTurn's 443-line body.
   */
  async handleTurn(
    userMessage: string,
    session: ConversationSession,
    onMessage: MessageHandler,
    sendToAdkFn: (session: ConversationSession, msg: string) => Promise<string>,
    runJsonPromptFn: (prompt: string) => Promise<unknown>
  ): Promise<void> {
    const deps: AgentDeps = {
      runJsonPrompt: runJsonPromptFn,
      sendToAdk: sendToAdkFn,
      config: this.config
    };

    // Reject new turns while a play is executing — prevents concurrent state corruption.
    if (session.state === "PERFORMANCE") {
      onMessage({ type: "text", content: "The play is in progress — please wait for it to finish." });
      return;
    }

    const intent = detectIntent(userMessage);
    const validIntents = VALID_INTENTS_BY_STATE[session.state];

    // Story requests are always allowed regardless of state — they reset the machine.
    const isStory = intent === "story_request" || isImpliedStoryRequest(userMessage, session);
    if (isStory) {
      // Cancel any pending approvals before starting fresh.
      this.cancelPendingApprovals(session, "New story request — starting fresh.");
      await this.handleStoryRequest(userMessage, session, onMessage, deps);
      return;
    }

    // Play request — only valid in CASTING (or when story exists, as a convenience).
    if (intent === "play_request") {
      if (!session.currentStory) {
        onMessage({
          type: "text",
          content: "We don't have a story yet! Tell me what kind of tale you'd like — for example: \"Tell me a Panchatantra tale about a clever crow\""
        });
        return;
      }
      await this.handlePlayRequest(session, onMessage, deps);
      return;
    }

    // Character generation — only valid with an active story.
    if (intent === "generate_char_request" && session.currentStory) {
      if (!validIntents.has("generate_char_request")) {
        onMessage({ type: "text", content: "We're not in the casting phase right now." });
        return;
      }
      session.state = "CASTING";
      await chitrakar.run(
        { mode: { kind: "on_demand", story: session.currentStory } },
        session,
        onMessage,
        deps
      );
      return;
    }

    // Conversational fallback via ADK.
    if (validIntents.has("conversation")) {
      const agentResponse = await Promise.race([
        deps.sendToAdk(session, userMessage),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("ADK response timed out after 30s")), 30_000)
        )
      ]);
      onMessage({ type: "text", content: agentResponse });
      return;
    }

    // Catch-all: state doesn't allow this action.
    onMessage({
      type: "text",
      content: "I'm not sure how to handle that right now. Tell me a story to begin!"
    });
  }

  private async handleStoryRequest(
    userMessage: string,
    session: ConversationSession,
    onMessage: MessageHandler,
    deps: AgentDeps
  ): Promise<void> {
    session.state = "STORY_GENERATION";

    const result = await sutradhar.run({ userMessage }, session, onMessage, deps);

    if (!result) {
      // User rejected or generation failed.
      session.state = "IDLE";
      return;
    }

    // Story accepted — proceed to casting.
    session.state = "CASTING";
    const { story, castingChoice } = result;

    if (castingChoice === "Use library characters") {
      await chitrakar.run({ mode: { kind: "use_library", story } }, session, onMessage, deps);
    } else if (castingChoice === "Mix (some library, some new)") {
      // Genuine mix: auto-approve library matches, generate only unmatched characters.
      await chitrakar.run({ mode: { kind: "mix", story } }, session, onMessage, deps);
    } else {
      // "Yes, generate characters" | "Generate new characters"
      await chitrakar.run({ mode: { kind: "batch_generate", story } }, session, onMessage, deps);
    }
    // State stays CASTING until the user says "let's perform".
  }

  private async handlePlayRequest(
    session: ConversationSession,
    onMessage: MessageHandler,
    deps: AgentDeps
  ): Promise<void> {
    session.state = "PERFORMANCE";

    await rangmanch.run(
      {
        story: session.currentStory!,
        approvedCharacters: session.approvedCharacters
      },
      session,
      onMessage,
      deps
    );

    // Rangmanch clears currentStory + approvedCharacters on success.
    // Ensure we return to IDLE in all cases (including error path where rangmanch
    // caught the error and left story intact — let CASTING be the retry state).
    if (session.currentStory) {
      // Story survived — play failed or was partial; keep CASTING for retry.
      session.state = "CASTING";
    } else {
      session.state = "IDLE";
    }
  }

  /**
   * Reject all pending approvals for a session.
   * Called when a new story request interrupts an ongoing approval loop.
   */
  private cancelPendingApprovals(session: ConversationSession, reason: string): void {
    for (const approval of session.pendingApprovals.values()) {
      approval.reject(reason);
    }
    session.pendingApprovals.clear();
  }
}
