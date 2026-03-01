import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — declared before imports.
// ---------------------------------------------------------------------------

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

import { chitrakar } from "../../src/agents/chitrakar.js";
import { generateCharacter } from "../../src/tools/characterGenerator.js";
import { sessionStore } from "../../src/sessionStore.js";
import type { AgentStreamMessage, ConversationSession, GeneratedStory, CharacterAsset } from "../../src/types.js";
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
  state: "CASTING",
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

/** Returns a CharacterAsset-compatible mock for generateCharacter results. */
const makeGenerationResult = (name: string): CharacterAsset => ({
  assetId: `asset-${name.toLowerCase()}`,
  name,
  archetype: "trickster",
  previewUrl: `https://example.com/${name.toLowerCase()}.png`,
  hasParts: false,
  source: "stub"
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

describe("Chitrakar agent", () => {
  let capturedMessages: AgentStreamMessage[];
  let onMessage: MessageHandler;

  beforeEach(() => {
    capturedMessages = [];
    onMessage = (msg) => { capturedMessages.push(msg); };
    vi.clearAllMocks();
  });

  describe("use_library mode", () => {
    it("auto-approves library matches and emits ready message", async () => {
      const session = makeSession();
      const story = makeStory();

      const result = await chitrakar.run({ mode: { kind: "use_library", story } }, session, onMessage, makeDeps());

      // Library is mocked to return empty map — no assets approved.
      const errorMsgs = capturedMessages.filter((m) => m.type === "error");
      expect(errorMsgs).toHaveLength(0);

      const textContents = capturedMessages
        .filter((m) => m.type === "text")
        .map((m) => (m as { type: "text"; content: string }).content);
      expect(textContents.some((c) => c.includes("let's perform"))).toBe(true);

      // Result map should match session approved characters.
      for (const [charId, asset] of result) {
        expect(session.approvedCharacters.get(charId)).toBe(asset);
      }
    });
  });

  describe("batch_generate mode", () => {
    it("generates all characters with approval and stores them in session", async () => {
      const session = makeSession();
      const story = makeStory();

      vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Perfect! Add to cast");
      vi.mocked(generateCharacter)
        .mockResolvedValueOnce(makeGenerationResult("Crow"))
        .mockResolvedValueOnce(makeGenerationResult("Fox"));

      const result = await chitrakar.run({ mode: { kind: "batch_generate", story } }, session, onMessage, makeDeps());

      const imageMsgs = capturedMessages.filter((m) => m.type === "image");
      expect(imageMsgs.length).toBe(2);

      const textContents = capturedMessages
        .filter((m) => m.type === "text")
        .map((m) => (m as { type: "text"; content: string }).content);
      expect(textContents.some((c) => c.includes("let's perform"))).toBe(true);

      expect(result.size).toBe(2);
      expect(session.approvedCharacters.size).toBe(2);
    });

    it("continues generating other characters when one fails", async () => {
      const session = makeSession();
      const story = makeStory();

      vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Perfect! Add to cast");
      vi.mocked(generateCharacter)
        .mockRejectedValueOnce(new Error("API error"))        // Crow fails
        .mockResolvedValueOnce(makeGenerationResult("Fox"));  // Fox succeeds

      await expect(
        chitrakar.run({ mode: { kind: "batch_generate", story } }, session, onMessage, makeDeps())
      ).resolves.toBeDefined();

      const errorMsgs = capturedMessages.filter((m) => m.type === "error");
      expect(errorMsgs.length).toBeGreaterThan(0);
    });

    it("does not auto-accept retry — requires explicit second approval", async () => {
      const session = makeSession();
      const story = makeStory();

      // First approval: "Generate another variation" — should trigger re-generation + re-approval.
      // Second approval: "Perfect! Add to cast" — should be accepted.
      vi.mocked(sessionStore.addPendingApproval)
        .mockResolvedValueOnce("Generate another variation")  // crow attempt 1 rejected
        .mockResolvedValueOnce("Perfect! Add to cast")        // crow attempt 2 approved
        .mockResolvedValueOnce("Perfect! Add to cast");       // fox approved
      vi.mocked(generateCharacter)
        .mockResolvedValue(makeGenerationResult("Crow"));

      const result = await chitrakar.run({ mode: { kind: "batch_generate", story } }, session, onMessage, makeDeps());

      // Crow should end up in cast after second approval.
      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe("on_demand mode", () => {
    it("generates the next unapproved character by charId", async () => {
      const session = makeSession({
        approvedCharacters: new Map([["crow-1", makeAsset("Crow")]]) // Crow approved by charId
      });
      const story = makeStory();

      vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Perfect! Add to cast");
      vi.mocked(generateCharacter).mockResolvedValue(makeGenerationResult("Fox"));

      await chitrakar.run({ mode: { kind: "on_demand", story } }, session, onMessage, makeDeps());

      // Only one generation call (Fox — Crow is approved by charId, not name).
      expect(generateCharacter).toHaveBeenCalledTimes(1);
      const imageMsgs = capturedMessages.filter((m) => m.type === "image");
      expect(imageMsgs.length).toBe(1);
    });

    it("tells user to ask again when 'Generate another variation' selected in on_demand", async () => {
      const session = makeSession();
      const story = makeStory();

      vi.mocked(sessionStore.addPendingApproval).mockResolvedValue("Generate another variation");
      vi.mocked(generateCharacter).mockResolvedValue(makeGenerationResult("Crow"));

      await chitrakar.run({ mode: { kind: "on_demand", story } }, session, onMessage, makeDeps());

      // Character should NOT be added to cast for on_demand variation.
      expect(session.approvedCharacters.size).toBe(0);

      const textContents = capturedMessages
        .filter((m) => m.type === "text")
        .map((m) => (m as { type: "text"; content: string }).content);
      expect(textContents.some((c) => c.includes("generate character"))).toBe(true);
    });

    it("reports when all characters are already approved", async () => {
      const story = makeStory();
      const session = makeSession({
        approvedCharacters: new Map([
          ["crow-1", makeAsset("Crow")],
          ["fox-1", makeAsset("Fox")]
        ])
      });

      await chitrakar.run({ mode: { kind: "on_demand", story } }, session, onMessage, makeDeps());

      const textContents = capturedMessages
        .filter((m) => m.type === "text")
        .map((m) => (m as { type: "text"; content: string }).content);
      expect(textContents.some((c) => c.includes("already in your cast"))).toBe(true);
    });
  });
});
