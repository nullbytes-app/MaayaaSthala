import { describe, it, expect, vi } from "vitest";
import { generateStory } from "../src/tools/storyGenerator.js";

const VALID_NATYA_SCRIPT = `@1 SCENE_OPEN scene=forest setting=A magical forest at dusk
@2 NARRATE text=Long ago a brave prince set out on a quest storyState=invocation
@3 SPEAK role=c_prince text=I will find the golden flower
@5 GESTURE role=c_prince gesture=raise_arm
@8 NARRATE text=But a demon offered him power storyState=temptation_peak desireDelta=30 oathDelta=-20
@9 SPEAK role=c_demon text=Join me and the forest is yours
@12 GESTURE role=c_prince gesture=shake_head shadowDouble=true
@15 NARRATE text=The prince chose virtue over power storyState=restoration oathDelta=30
@18 SCENE_CLOSE scene=forest`;

const makeValidStoryJson = (overrides = {}) =>
  JSON.stringify({
    storyId: "story_test_001",
    title: "The Brave Prince",
    tradition: "chandamama",
    synopsis: "A brave prince faces a tempting demon and chooses virtue.",
    moral: "Virtue triumphs over temptation.",
    characters: [
      { charId: "c_prince", name: "Prince", archetype: "hero", description: "A brave young prince." },
      { charId: "c_demon", name: "Demon", archetype: "villain", description: "A cunning dark spirit." }
    ],
    natyaScript: VALID_NATYA_SCRIPT,
    ...overrides
  });

// --- Expected use ---
describe("generateStory — expected use", () => {
  it("generates a valid story with compilable NatyaScript", async () => {
    const mockRunJsonPrompt = vi.fn().mockResolvedValue(JSON.parse(makeValidStoryJson()));

    const result = await generateStory(
      { userRequest: "Tell me a Chandamama story about a brave prince" },
      { runJsonPrompt: mockRunJsonPrompt }
    );

    expect(result.storyId).toBe("story_test_001");
    expect(result.title).toBe("The Brave Prince");
    expect(result.characters).toHaveLength(2);
    expect(result.natyaScript).toContain("@1 SCENE_OPEN");
    expect(mockRunJsonPrompt).toHaveBeenCalledTimes(1);
  });

  it("detects chandamama tradition by default for generic requests", async () => {
    const mockRunJsonPrompt = vi.fn().mockResolvedValue(JSON.parse(makeValidStoryJson()));

    const result = await generateStory(
      { userRequest: "Tell me a story about a clever girl" },
      { runJsonPrompt: mockRunJsonPrompt }
    );

    expect(result.tradition).toBe("chandamama");
  });

  it("detects panchatantra tradition from user request", async () => {
    const mockRunJsonPrompt = vi
      .fn()
      .mockResolvedValue(JSON.parse(makeValidStoryJson({ tradition: "panchatantra" })));

    const result = await generateStory(
      { userRequest: "Tell me a Panchatantra story about animals" },
      { runJsonPrompt: mockRunJsonPrompt }
    );

    expect(result.tradition).toBe("panchatantra");
  });
});

// --- Edge case ---
describe("generateStory — edge cases", () => {
  it("retries once when NatyaScript compilation fails, then succeeds", async () => {
    const badScript = "this is not valid natya script at all";
    const mockRunJsonPrompt = vi
      .fn()
      .mockResolvedValueOnce(JSON.parse(makeValidStoryJson({ natyaScript: badScript })))
      .mockResolvedValueOnce(JSON.parse(makeValidStoryJson())); // Retry succeeds

    const result = await generateStory(
      { userRequest: "Tell me a story" },
      { runJsonPrompt: mockRunJsonPrompt }
    );

    expect(mockRunJsonPrompt).toHaveBeenCalledTimes(2);
    expect(result.title).toBe("The Brave Prince");
  });

  it("uses tradition override when provided", async () => {
    const mockRunJsonPrompt = vi
      .fn()
      .mockResolvedValue(JSON.parse(makeValidStoryJson({ tradition: "vikram_betaal" })));

    const result = await generateStory(
      { userRequest: "Tell me a story", tradition: "vikram_betaal" },
      { runJsonPrompt: mockRunJsonPrompt }
    );

    expect(result.tradition).toBe("vikram_betaal");
  });
});

// --- Failure case ---
describe("generateStory — failure cases", () => {
  it("throws when runJsonPrompt rejects", async () => {
    const mockRunJsonPrompt = vi.fn().mockRejectedValue(new Error("Gemini API error"));

    await expect(
      generateStory({ userRequest: "Tell me a story" }, { runJsonPrompt: mockRunJsonPrompt })
    ).rejects.toThrow("Story generation failed: Gemini API error");
  });

  it("throws when response is missing required fields", async () => {
    const mockRunJsonPrompt = vi.fn().mockResolvedValue({ title: "Missing fields" }); // No storyId

    await expect(
      generateStory({ userRequest: "Tell me a story" }, { runJsonPrompt: mockRunJsonPrompt })
    ).rejects.toThrow("missing storyId");
  });

  it("throws when NatyaScript fails on retry too", async () => {
    const badScript = "not valid natya";
    const mockRunJsonPrompt = vi
      .fn()
      .mockResolvedValue(JSON.parse(makeValidStoryJson({ natyaScript: badScript })));

    await expect(
      generateStory({ userRequest: "Tell me a story" }, { runJsonPrompt: mockRunJsonPrompt })
    ).rejects.toThrow();
  });
});
