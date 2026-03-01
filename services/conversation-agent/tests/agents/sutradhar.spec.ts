import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that use them.
// ---------------------------------------------------------------------------

vi.mock("../../src/tools/storyGenerator.js", () => ({
  generateStory: vi.fn()
}));

vi.mock("../../src/tools/characterBrowser.js", () => ({
  browseCharacters: vi.fn().mockResolvedValue([]),
  matchCharactersToLibrary: vi.fn().mockReturnValue(new Map())
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

import { sutradhar } from "../../src/agents/sutradhar.js";
import { generateStory } from "../../src/tools/storyGenerator.js";
import { sessionStore } from "../../src/sessionStore.js";
import type { ConversationSession, GeneratedStory, AgentStreamMessage } from "../../src/types.js";
import type { AgentDeps, MessageHandler } from "../../src/agents/types.js";

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
    { charId: "crow-1", name: "Crow", archetype: "trickster", description: "A clever crow" },
    { charId: "fox-1", name: "Fox", archetype: "villain", description: "A wily fox" }
  ],
  natyaScript: "@1 SCENE_OPEN setting=forest\n@2 NARRATE text=Once upon a time",
  moral: "Wit beats brute force."
});

const makeDeps = (): AgentDeps => ({
  runJsonPrompt: vi.fn(),
  sendToAdk: vi.fn(),
  config: {}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Sutradhar agent", () => {
  let capturedMessages: AgentStreamMessage[];
  let onMessage: MessageHandler;

  beforeEach(() => {
    capturedMessages = [];
    onMessage = (msg) => { capturedMessages.push(msg); };
    vi.clearAllMocks();
  });

  it("generates a story, presents it, and returns result with castingChoice", async () => {
    const session = makeSession();
    const story = makeStory();
    vi.mocked(generateStory).mockResolvedValue(story);
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Use library characters");

    const deps = makeDeps();
    const result = await sutradhar.run({ userMessage: "Tell me a Panchatantra story" }, session, onMessage, deps);

    expect(result).not.toBeNull();
    expect(result?.story).toBe(story);
    expect(result?.castingChoice).toBe("Use library characters");
    expect(session.currentStory).toBe(story);
  });

  it("emits thinking + text messages during generation", async () => {
    const session = makeSession();
    vi.mocked(generateStory).mockResolvedValue(makeStory());
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Yes, generate characters");

    const deps = makeDeps();
    await sutradhar.run({ userMessage: "Tell me a tale about a clever crow" }, session, onMessage, deps);

    const types = capturedMessages.map((m) => m.type);
    expect(types).toContain("thinking");
    expect(types).toContain("text");
  });

  it("returns null and emits error when generateStory throws", async () => {
    const session = makeSession();
    vi.mocked(generateStory).mockRejectedValue(new Error("Story generation timed out — please try again"));

    const deps = makeDeps();
    const result = await sutradhar.run({ userMessage: "Tell me a story" }, session, onMessage, deps);

    expect(result).toBeNull();
    const errorMsgs = capturedMessages.filter((m) => m.type === "error");
    expect(errorMsgs.length).toBeGreaterThan(0);
  });

  it("returns null when user selects 'Tell me a different story'", async () => {
    const session = makeSession();
    vi.mocked(generateStory).mockResolvedValue(makeStory());
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Tell me a different story");

    const deps = makeDeps();
    const result = await sutradhar.run({ userMessage: "A tale about anything" }, session, onMessage, deps);

    expect(result).toBeNull();
    expect(session.currentStory).toBeUndefined();
    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    expect(textMsgs.some((c) => c.includes("What kind of story"))).toBe(true);
  });

  it("resets previous story state before generating new story", async () => {
    const prevStory = makeStory();
    const session = makeSession({
      currentStory: prevStory,
      approvedCharacters: new Map([["old-char", {
        assetId: "a1", name: "old", archetype: "hero", previewUrl: "", hasParts: false, source: "library"
      }]])
    });
    vi.mocked(generateStory).mockResolvedValue(makeStory());
    vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Yes, generate characters");

    const deps = makeDeps();
    await sutradhar.run({ userMessage: "A new story please" }, session, onMessage, deps);

    // Previous characters cleared when starting new story.
    expect(session.approvedCharacters.size).toBe(0);
  });
});
