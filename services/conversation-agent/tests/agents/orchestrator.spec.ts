import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — declared before imports.
// ---------------------------------------------------------------------------

vi.mock("../../src/tools/storyGenerator.js", () => ({
  generateStory: vi.fn()
}));

vi.mock("../../src/tools/characterBrowser.js", () => ({
  browseCharacters: vi.fn().mockResolvedValue([]),
  matchCharactersToLibrary: vi.fn().mockReturnValue(new Map())
}));

vi.mock("../../src/tools/characterGenerator.js", () => ({
  generateCharacter: vi.fn(),
  buildGenerationRequest: vi.fn((char: { charId: string; name: string }) => ({
    charId: char.charId,
    name: char.name,
    archetype: "trickster",
    description: "test",
    needsParts: false
  })),
  approveAndCacheCharacter: vi.fn()
}));

vi.mock("../../src/tools/playCompiler.js", () => ({
  compileAndRunPlay: vi.fn().mockResolvedValue([])
}));

vi.mock("../../src/sessionStore.js", () => {
  const addPendingApproval = vi.fn();
  return {
    sessionStore: {
      addPendingApproval,
      resolveApproval: vi.fn(),
      getOrCreate: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    }
  };
});

// ---------------------------------------------------------------------------
// Actual imports after mocks
// ---------------------------------------------------------------------------

import { TheatreOrchestrator } from "../../src/agents/orchestrator.js";
import { generateStory } from "../../src/tools/storyGenerator.js";
import { generateCharacter } from "../../src/tools/characterGenerator.js";
import { compileAndRunPlay } from "../../src/tools/playCompiler.js";
import { sessionStore } from "../../src/sessionStore.js";
import type { ConversationSession, GeneratedStory, AgentStreamMessage } from "../../src/types.js";
import type { MessageHandler } from "../../src/agents/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSession = (overrides?: Partial<ConversationSession>): ConversationSession => ({
  sessionId: "test-session",
  userId: "test-user",
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
  approvedCharacters: new Map(),
  pendingApprovals: new Map(),
  state: "IDLE",
  activeTurn: Promise.resolve(),
  ...overrides
});

const makeStory = (): GeneratedStory => ({
  storyId: "story-1",
  title: "The Clever Crow",
  tradition: "panchatantra",
  synopsis: "A clever crow outsmarts a wily fox.",
  characters: [
    { charId: "crow-1", name: "Crow", archetype: "trickster", description: "A clever crow" }
  ],
  natyaScript: "@1 SCENE_OPEN setting=forest\n@2 NARRATE text=Once upon a time",
  moral: "Wit beats brute force."
});

const makeOrchestrator = () => new TheatreOrchestrator({} as never, {} as never, {});
const makeSendToAdk = () => vi.fn().mockResolvedValue("Welcome! Tell me a story.");
const makeRunJsonPrompt = () => vi.fn().mockResolvedValue({});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TheatreOrchestrator — intent detection", () => {
  let capturedMessages: AgentStreamMessage[];
  let onMessage: MessageHandler;

  beforeEach(() => {
    capturedMessages = [];
    onMessage = (msg) => { capturedMessages.push(msg); };
    vi.clearAllMocks();
    vi.mocked(compileAndRunPlay).mockResolvedValue([]);
  });

  it("routes play request to Rangmanch when story exists", async () => {
    const session = makeSession({ currentStory: makeStory(), state: "CASTING" });
    const orch = makeOrchestrator();

    await orch.handleTurn("let's perform", session, onMessage, makeSendToAdk(), makeRunJsonPrompt());

    expect(session.state).toBe("IDLE");

    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    expect(textMsgs.some((c) => c.includes("stage is set"))).toBe(true);
  });

  it("emits error message when play requested without a story", async () => {
    const session = makeSession();
    const orch = makeOrchestrator();

    await orch.handleTurn("let's perform", session, onMessage, makeSendToAdk(), makeRunJsonPrompt());

    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    expect(textMsgs.some((c) => c.includes("don't have a story"))).toBe(true);
    expect(session.state).toBe("IDLE");
  });

  it("routes story keywords to Sutradhar", async () => {
    const session = makeSession();
    const orch = makeOrchestrator();

    vi.mocked(generateStory).mockResolvedValue(makeStory());
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Tell me a different story");

    await orch.handleTurn(
      "Tell me a Panchatantra tale about a clever crow",
      session,
      onMessage,
      makeSendToAdk(),
      makeRunJsonPrompt()
    );

    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    expect(textMsgs.some((c) => c.includes("weave a tale"))).toBe(true);
  });

  it("routes 4-word unlabeled messages as story request when no story exists", async () => {
    const session = makeSession();
    const orch = makeOrchestrator();

    vi.mocked(generateStory).mockResolvedValue(makeStory());
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Tell me a different story");

    await orch.handleTurn(
      "A lion and a mouse",
      session,
      onMessage,
      makeSendToAdk(),
      makeRunJsonPrompt()
    );

    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    expect(textMsgs.some((c) => c.includes("weave a tale"))).toBe(true);
  });

  it("routes unknown messages to ADK conversational fallback", async () => {
    const session = makeSession({ currentStory: makeStory(), state: "CASTING" });
    const orch = makeOrchestrator();
    const sendToAdk = vi.fn().mockResolvedValue("Hello! How can I help you?");

    await orch.handleTurn("what is the weather?", session, onMessage, sendToAdk, makeRunJsonPrompt());

    expect(sendToAdk).toHaveBeenCalled();
    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    expect(textMsgs.some((c) => c.includes("Hello!"))).toBe(true);
  });

  it("state transitions: IDLE → CASTING after story accepted with library characters", async () => {
    const session = makeSession();
    const orch = makeOrchestrator();

    vi.mocked(generateStory).mockResolvedValue(makeStory());
    // First approval: "Use library characters" (accepts the story + uses library).
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Use library characters");

    expect(session.state).toBe("IDLE");
    await orch.handleTurn(
      "Tell me a Panchatantra story",
      session,
      onMessage,
      makeSendToAdk(),
      makeRunJsonPrompt()
    );

    // After story generated + library characters selected, state should be CASTING.
    expect(session.state).toBe("CASTING");
  });

  // ---------------------------------------------------------------------------
  // Adversarial tests
  // ---------------------------------------------------------------------------

  it("cancels pending approvals when a new story request interrupts", async () => {
    const session = makeSession({ state: "CASTING", currentStory: makeStory() });
    const orch = makeOrchestrator();

    // Simulate a pending approval that should be rejected on new story request.
    let rejectCalled = false;
    session.pendingApprovals.set("req-1", {
      requestId: "req-1",
      context: "Character approval",
      choices: [],
      resolve: vi.fn(),
      reject: (_reason: string) => { rejectCalled = true; }
    });

    vi.mocked(generateStory).mockResolvedValue(makeStory());
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Tell me a different story");

    await orch.handleTurn("Tell me a Panchatantra story", session, onMessage, makeSendToAdk(), makeRunJsonPrompt());

    // Pending approval from previous turn should have been cancelled.
    expect(rejectCalled).toBe(true);
    expect(session.pendingApprovals.size).toBe(0);
  });

  it("mix mode: routes 'Mix' casting choice correctly", async () => {
    const session = makeSession();
    const orch = makeOrchestrator();

    vi.mocked(generateStory).mockResolvedValue(makeStory());
    // Library is mocked empty (no matches) → all chars unmatched → batch-generate unmatched.
    // First addPendingApproval = casting choice "Mix"; second = character approval.
    vi.mocked(sessionStore.addPendingApproval)
      .mockResolvedValueOnce("Mix (some library, some new)")  // casting choice
      .mockResolvedValueOnce("Perfect! Add to cast");         // character approval
    vi.mocked(generateCharacter).mockResolvedValue({
      assetId: "a1", name: "Crow", archetype: "trickster", previewUrl: "https://example.com/crow.png",
      hasParts: false, source: "stub"
    });

    await orch.handleTurn("Tell me a Panchatantra story", session, onMessage, makeSendToAdk(), makeRunJsonPrompt());

    // Should land in CASTING after mix mode completes.
    expect(session.state).toBe("CASTING");
    // No errors emitted.
    const errorMsgs = capturedMessages.filter((m) => m.type === "error");
    expect(errorMsgs).toHaveLength(0);
  });

  it("play failure returns to CASTING state (not IDLE) to allow retry", async () => {
    const story = makeStory();
    const session = makeSession({ currentStory: story, state: "CASTING" });
    const orch = makeOrchestrator();

    vi.mocked(compileAndRunPlay).mockRejectedValue(new Error("NatyaScript compile error"));

    await orch.handleTurn("let's perform", session, onMessage, makeSendToAdk(), makeRunJsonPrompt());

    // After play failure, story is preserved and state goes back to CASTING.
    expect(session.state).toBe("CASTING");
    expect(session.currentStory).toBeDefined();
  });

  it("blocks new turns during PERFORMANCE state", async () => {
    const session = makeSession({ state: "PERFORMANCE" });
    const orch = makeOrchestrator();
    const sendToAdk = vi.fn();

    await orch.handleTurn("anything at all", session, onMessage, sendToAdk, makeRunJsonPrompt());

    // ADK should not be called, no agent processing.
    expect(sendToAdk).not.toHaveBeenCalled();
    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    expect(textMsgs.some((c) => c.includes("play is in progress"))).toBe(true);
  });

  it("does not misroute 'show me a story' as a play request", async () => {
    // 'show' was previously in play keywords — verify it no longer fires play intent.
    const session = makeSession({ state: "IDLE" });
    const orch = makeOrchestrator();

    vi.mocked(generateStory).mockResolvedValue(makeStory());
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Tell me a different story");

    await orch.handleTurn("show me a story about a clever fox", session, onMessage, makeSendToAdk(), makeRunJsonPrompt());

    // Should route to Sutradhar (story generation), not Rangmanch.
    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    // Should NOT say "We don't have a story" (play request without story error).
    expect(textMsgs.every((c) => !c.includes("don't have a story"))).toBe(true);
  });
});
