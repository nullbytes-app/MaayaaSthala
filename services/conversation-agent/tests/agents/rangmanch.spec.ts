import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — declared before imports.
// ---------------------------------------------------------------------------

vi.mock("../../src/tools/playCompiler.js", () => ({
  compileAndRunPlay: vi.fn().mockResolvedValue([])
}));

vi.mock("../../src/tools/characterBrowser.js", () => ({
  browseCharacters: vi.fn().mockResolvedValue([]),
  matchCharactersToLibrary: vi.fn().mockReturnValue(new Map())
}));

// ---------------------------------------------------------------------------
// Actual imports after mocks
// ---------------------------------------------------------------------------

import { rangmanch } from "../../src/agents/rangmanch.js";
import { compileAndRunPlay } from "../../src/tools/playCompiler.js";
import type { ConversationSession, GeneratedStory, CharacterAsset, AgentStreamMessage } from "../../src/types.js";
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
  state: "PERFORMANCE",
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

const makeAsset = (name: string): CharacterAsset => ({
  assetId: `asset-${name.toLowerCase()}`,
  name,
  archetype: "trickster",
  previewUrl: `https://example.com/${name.toLowerCase()}.png`,
  hasParts: false,
  source: "stub"
});

const makeDeps = (): AgentDeps => ({
  runJsonPrompt: vi.fn(),
  sendToAdk: vi.fn(),
  config: {}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Rangmanch agent", () => {
  let capturedMessages: AgentStreamMessage[];
  let onMessage: MessageHandler;

  beforeEach(() => {
    capturedMessages = [];
    onMessage = (msg) => { capturedMessages.push(msg); };
    vi.clearAllMocks();
    vi.mocked(compileAndRunPlay).mockResolvedValue([]);
  });

  it("emits character_portrait events before play starts", async () => {
    const session = makeSession();
    const story = makeStory();
    const approvedCharacters = new Map([
      ["crow-1", makeAsset("Crow")],
      ["fox-1", makeAsset("Fox")]
    ]);

    await rangmanch.run({ story, approvedCharacters }, session, onMessage, makeDeps());

    const portraitMsgs = capturedMessages.filter((m) => m.type === "character_portrait");
    expect(portraitMsgs.length).toBe(2);
  });

  it("resets session story state after successful play", async () => {
    const session = makeSession({
      currentStory: makeStory(),
      approvedCharacters: new Map([["crow-1", makeAsset("Crow")]])
    });
    const story = makeStory();
    const approvedCharacters = new Map([["crow-1", makeAsset("Crow")]]);

    await rangmanch.run({ story, approvedCharacters }, session, onMessage, makeDeps());

    expect(session.currentStory).toBeUndefined();
    expect(session.approvedCharacters.size).toBe(0);
  });

  it("auto-fills from library when no approved characters provided", async () => {
    const session = makeSession();
    const story = makeStory();
    const approvedCharacters = new Map<string, CharacterAsset>();

    // Should not throw — library is empty in test env (mocked), play runs with empty cast.
    await expect(rangmanch.run({ story, approvedCharacters }, session, onMessage, makeDeps())).resolves.toBeUndefined();
    expect(compileAndRunPlay).toHaveBeenCalled();
  });

  it("emits error message without throwing when play compilation fails", async () => {
    const session = makeSession();
    const story = makeStory();
    const approvedCharacters = new Map([["crow-1", makeAsset("Crow")]]);

    vi.mocked(compileAndRunPlay).mockRejectedValue(new Error("NatyaScript parse error"));

    await expect(rangmanch.run({ story, approvedCharacters }, session, onMessage, makeDeps())).resolves.toBeUndefined();

    const errorMsgs = capturedMessages.filter((m) => m.type === "error");
    expect(errorMsgs.length).toBe(1);
    const errorMsg = errorMsgs[0] as { type: "error"; message: string };
    expect(errorMsg.message).toContain("Play execution failed");
  });

  it("emits curtain-call text after successful performance", async () => {
    const session = makeSession();
    const story = makeStory();
    const approvedCharacters = new Map([["crow-1", makeAsset("Crow")]]);

    await rangmanch.run({ story, approvedCharacters }, session, onMessage, makeDeps());

    const textMsgs = capturedMessages
      .filter((m) => m.type === "text")
      .map((m) => (m as { type: "text"; content: string }).content);
    expect(textMsgs.some((c) => c.includes("curtain falls"))).toBe(true);
  });
});
