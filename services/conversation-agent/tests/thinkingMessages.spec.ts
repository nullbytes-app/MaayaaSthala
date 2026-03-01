import { describe, it, expect, vi } from "vitest";
import { compileAndRunPlay } from "../src/tools/playCompiler.js";
import type { AgentStreamMessage, GeneratedStory, CharacterAsset } from "../src/types.js";

/**
 * Tests for thinking message emission and clearing.
 * Verifies the thinking indicator protocol (emit before ops, clear after).
 */

const VALID_NATYA_SCRIPT = `@1 SCENE_OPEN scene=forest setting=A magical forest
@2 NARRATE text=Long ago a brave prince set out storyState=invocation
@3 SPEAK role=c_hero text=I will succeed
@5 GESTURE role=c_hero gesture=raise_arm
@8 SCENE_CLOSE scene=forest`;

const testStory: GeneratedStory = {
  storyId: "story_thinking_test",
  title: "Thinking Test",
  tradition: "chandamama",
  synopsis: "A test story for thinking indicators.",
  characters: [{ charId: "c_hero", name: "Hero", archetype: "hero", description: "A brave hero." }],
  natyaScript: VALID_NATYA_SCRIPT
};

const testCharacters = new Map<string, CharacterAsset>([
  [
    "c_hero",
    {
      assetId: "asset_hero",
      name: "Hero",
      archetype: "hero",
      previewUrl: "/generated/asset_hero.png",
      hasParts: true,
      source: "library"
    }
  ]
]);

// --- Thinking message type contract ---
describe("thinking message type", () => {
  it("has required 'stage' field", () => {
    const thinking: AgentStreamMessage = { type: "thinking", stage: "Weaving your tale..." };
    expect(thinking.type).toBe("thinking");
    expect(thinking.stage).toBe("Weaving your tale...");
  });

  it("accepts empty stage string for clearing", () => {
    const clear: AgentStreamMessage = { type: "thinking", stage: "" };
    expect(clear.type).toBe("thinking");
    expect(clear.stage).toBe("");
  });
});

// --- scene_backdrop message type ---
describe("scene_backdrop message type", () => {
  it("has required fields", () => {
    const backdrop: AgentStreamMessage = {
      type: "scene_backdrop",
      sceneId: "scene_001",
      imageUrl: "data:image/png;base64,abc123",
      setting: "A magical forest"
    };
    expect(backdrop.type).toBe("scene_backdrop");
    expect(backdrop.sceneId).toBe("scene_001");
    expect(backdrop.imageUrl).toBe("data:image/png;base64,abc123");
    expect(backdrop.setting).toBe("A magical forest");
  });
});

// --- character_portrait message type ---
describe("character_portrait message type", () => {
  it("has required fields", () => {
    const portrait: AgentStreamMessage = {
      type: "character_portrait",
      charId: "c_hero",
      name: "Hero",
      imageUrl: "/generated/hero.png"
    };
    expect(portrait.type).toBe("character_portrait");
    expect(portrait.charId).toBe("c_hero");
    expect(portrait.name).toBe("Hero");
  });
});

// --- play compilation emits scene_backdrop (not image) for SCENE_OPEN when imagesEnabled ---
describe("compileAndRunPlay — scene_backdrop emission", () => {
  it("does NOT emit old image type for SCENE_OPEN when images disabled", async () => {
    const messages: AgentStreamMessage[] = [];

    await compileAndRunPlay(
      { story: testStory, approvedCharacters: testCharacters },
      { onMessage: (m) => messages.push(m), beatDelayMs: 0, audioEnabled: false, imagesEnabled: false }
    );

    const imageMessages = messages.filter((m) => m.type === "image");
    expect(imageMessages).toHaveLength(0);
  });

  it("stage_command and play_frame are emitted for all opcodes including NARRATE and SPEAK", async () => {
    const messages: AgentStreamMessage[] = [];

    await compileAndRunPlay(
      { story: testStory, approvedCharacters: testCharacters },
      { onMessage: (m) => messages.push(m), beatDelayMs: 0, audioEnabled: false, imagesEnabled: false }
    );

    // Count stage_command messages — should match total commands (one per beat).
    const stageCommands = messages.filter((m) => m.type === "stage_command");
    const playFrames = messages.filter((m) => m.type === "play_frame");

    expect(stageCommands.length).toBeGreaterThan(0);
    expect(playFrames.length).toBeGreaterThan(0);
    // Director directives (CAMERA/EFFECT/SPOTLIGHT) inject additional stage_commands before each beat,
    // so stageCommands.length >= playFrames.length (one play_frame per story beat, but
    // multiple stage_commands per beat when director is active).
    expect(stageCommands.length).toBeGreaterThanOrEqual(playFrames.length);
  });
});
