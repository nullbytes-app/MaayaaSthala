import { describe, it, expect, vi } from "vitest";
import { compileAndRunPlay } from "../src/tools/playCompiler.js";
import type { AgentStreamMessage, GeneratedStory, CharacterAsset } from "../src/types.js";

const VALID_NATYA_SCRIPT = `@1 SCENE_OPEN scene=forest setting=A magical forest
@2 NARRATE text=Long ago a brave prince set out storyState=invocation
@3 SPEAK role=c_hero text=I will succeed
@5 GESTURE role=c_hero gesture=raise_arm
@8 NARRATE text=Temptation appeared storyState=temptation_peak desireDelta=30 oathDelta=-20
@12 GESTURE role=c_hero gesture=shake_head shadowDouble=true
@15 NARRATE text=Virtue prevailed storyState=restoration oathDelta=30
@18 SCENE_CLOSE scene=forest`;

const testStory: GeneratedStory = {
  storyId: "story_test_001",
  title: "The Brave Prince",
  tradition: "chandamama",
  synopsis: "A test story.",
  characters: [{ charId: "c_hero", name: "Hero", archetype: "hero", description: "A brave hero." }],
  natyaScript: VALID_NATYA_SCRIPT
};

const testCharacters = new Map<string, CharacterAsset>([
  [
    "c_hero",
    {
      assetId: "asset_hero_001",
      name: "Hero",
      archetype: "hero",
      previewUrl: "/generated/asset_hero_001.png",
      hasParts: true,
      source: "library"
    }
  ]
]);

// --- Expected use ---
describe("compileAndRunPlay — expected use", () => {
  it("emits a play_start message first, followed by stage commands", async () => {
    const messages: AgentStreamMessage[] = [];

    await compileAndRunPlay(
      { story: testStory, approvedCharacters: testCharacters },
      { onMessage: (m) => messages.push(m), beatDelayMs: 0, audioEnabled: false, imagesEnabled: false }
    );

    expect(messages[0].type).toBe("play_start");
    expect((messages[0] as Extract<AgentStreamMessage, { type: "play_start" }>).storyTitle).toBe(
      "The Brave Prince"
    );
    expect(messages.some((m) => m.type === "stage_command")).toBe(true);
    expect(messages.some((m) => m.type === "play_frame")).toBe(true);
  });

  it("emits narration text for NARRATE beats", async () => {
    const messages: AgentStreamMessage[] = [];

    await compileAndRunPlay(
      { story: testStory, approvedCharacters: testCharacters },
      { onMessage: (m) => messages.push(m), beatDelayMs: 0, audioEnabled: false, imagesEnabled: false }
    );

    const textMessages = messages.filter((m) => m.type === "text");
    expect(textMessages.length).toBeGreaterThan(0);
    expect(
      textMessages.some(
        (m) =>
          m.type === "text" && (m as Extract<AgentStreamMessage, { type: "text" }>).content.includes("Long ago")
      )
    ).toBe(true);
  });

  it("emits dialogue text for SPEAK beats", async () => {
    const messages: AgentStreamMessage[] = [];

    await compileAndRunPlay(
      { story: testStory, approvedCharacters: testCharacters },
      { onMessage: (m) => messages.push(m), beatDelayMs: 0, audioEnabled: false, imagesEnabled: false }
    );

    const textMessages = messages.filter((m) => m.type === "text");
    expect(
      textMessages.some(
        (m) =>
          m.type === "text" &&
          (m as Extract<AgentStreamMessage, { type: "text" }>).content.includes("I will succeed")
      )
    ).toBe(true);
  });

  it("returns all compiled commands", async () => {
    const commands = await compileAndRunPlay(
      { story: testStory, approvedCharacters: testCharacters },
      { onMessage: () => {}, beatDelayMs: 0, audioEnabled: false, imagesEnabled: false }
    );

    expect(commands.length).toBeGreaterThan(0);
    expect(commands[0].opcode).toBe("SCENE_OPEN");
  });
});

// --- Edge case ---
describe("compileAndRunPlay — edge cases", () => {
  it("uses placeholder_artifact when no characters are approved", async () => {
    const commands = await compileAndRunPlay(
      { story: testStory, approvedCharacters: new Map() },
      { onMessage: () => {}, beatDelayMs: 0, audioEnabled: false, imagesEnabled: false }
    );

    expect(commands[0].target.artifactId).toBe("placeholder_artifact");
  });

  it("does not throw when beatDelayMs is 0", async () => {
    await expect(
      compileAndRunPlay(
        { story: testStory, approvedCharacters: testCharacters },
        { onMessage: () => {}, beatDelayMs: 0, audioEnabled: false, imagesEnabled: false }
      )
    ).resolves.not.toThrow();
  });
});

// --- Failure case ---
describe("compileAndRunPlay — failure cases", () => {
  it("throws on invalid NatyaScript", async () => {
    const badStory: GeneratedStory = {
      ...testStory,
      natyaScript: "this is completely invalid"
    };

    await expect(
      compileAndRunPlay(
        { story: badStory, approvedCharacters: testCharacters },
        { onMessage: () => {}, beatDelayMs: 0 }
      )
    ).rejects.toThrow();
  });
});
