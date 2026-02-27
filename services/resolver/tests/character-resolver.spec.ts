import { describe, expect, it } from "vitest";
import { analyzeStory } from "../src/routes/analyzeStory";
import { resolveCharacters } from "../src/routes/resolveCharacters";
import { ARTIFACT_REGISTRY, scoreCharacterToArtifact } from "../src/domain/matchScorer";

const storyInput = {
  storyId: "chandamama_001",
  language: "te",
  style: "leather-shadow",
  text: "Raju met the Village Elder. Later Raju fought Demon King in the forest."
};

describe("character resolver", () => {
  it("returns resolved and unresolved character sets", async () => {
    const analyzed = await analyzeStory({
      storyId: storyInput.storyId,
      language: storyInput.language,
      text: storyInput.text
    });

    const res = await resolveCharacters({
      storyId: storyInput.storyId,
      style: storyInput.style,
      characters: analyzed.characters
    });

    expect(res.resolvedCharacters.length).toBeGreaterThan(0);
    const resolvedWithSelection = res.resolvedCharacters.find(
      (character) => character.selectedArtifactId.length > 0
    );
    expect(resolvedWithSelection).toBeDefined();
    expect(resolvedWithSelection?.confidence).toBeGreaterThanOrEqual(0);
    expect(resolvedWithSelection?.confidence).toBeLessThanOrEqual(1);

    expect(Array.isArray(res.unresolvedCharacters)).toBe(true);
    if (res.unresolvedCharacters.length > 0) {
      expect(res.unresolvedCharacters[0]).toMatchObject({
        charId: expect.any(String),
        reason: expect.any(String),
        recommendedAction: "generate_artifact"
      });
    }
  });

  it("strips leading stopwords from extracted character names", async () => {
    const analyzed = await analyzeStory({
      storyId: "story-stopwords",
      language: "en",
      text: "Later Raju met An Elder near the river."
    });

    const names = analyzed.characters.map((character) => character.name);
    expect(names).toContain("Raju");
    expect(names).toContain("Elder");
    expect(names).not.toContain("Later Raju");
    expect(names).not.toContain("An Elder");
  });

  it("breaks score ties by artifact id in ascending order", async () => {
    const res = await resolveCharacters({
      storyId: "tie-breaker-story",
      style: "leather-shadow",
      characters: [
        {
          charId: "c_arun",
          name: "Arun",
          aliases: [],
          archetype: "hero"
        }
      ]
    });

    expect(res.resolvedCharacters[0]?.selectedArtifactId).toBe("hero_generic_v1");
  });

  it("matches tag tokens strictly to whole normalized tokens", () => {
    const artifact = ARTIFACT_REGISTRY.find((entry) => entry.artifactId === "hero_raju_v2");
    expect(artifact).toBeDefined();

    const score = scoreCharacterToArtifact(
      {
        charId: "c_rajuveer",
        name: "Rajuveer",
        aliases: [],
        archetype: "hero"
      },
      artifact!,
      "leather-shadow"
    );

    expect(score).toBe(0.8);
  });

  it("extracts repeated non-Latin character names for non-English language codes", async () => {
    const analyzed = await analyzeStory({
      storyId: "story-non-latin",
      language: "te",
      text: "రాజు గ్రామ పెద్దను కలిశాడు. తరువాత రాజు అడవికి వెళ్లాడు."
    });

    const names = analyzed.characters.map((character) => character.name);
    expect(names).toContain("రాజు");
  });

  it("handles CJK punctuation and extracts repeated names from Chinese text", async () => {
    const analyzed = await analyzeStory({
      storyId: "story-cjk",
      language: "zh",
      text: "阿明去了山上。阿明回来了。"
    });

    const names = analyzed.characters.map((character) => character.name);
    expect(names).toContain("阿明");
    expect(analyzed.scenes).toHaveLength(2);

    const aming = analyzed.characters.find((character) => character.name === "阿明");
    expect(aming).toBeDefined();
    expect(analyzed.scenes[0]?.characters).toContain(aming!.charId);
    expect(analyzed.scenes[1]?.characters).toContain(aming!.charId);
  });

  it("links scenes by normalized token matching instead of substring matching", async () => {
    const analyzed = await analyzeStory({
      storyId: "story-token-linking",
      language: "en",
      text: "Raj met Elder. Raju crossed the river."
    });

    const raj = analyzed.characters.find((character) => character.name === "Raj");
    const raju = analyzed.characters.find((character) => character.name === "Raju");

    expect(raj).toBeDefined();
    expect(raju).toBeDefined();

    const firstScene = analyzed.scenes[0];
    const secondScene = analyzed.scenes[1];

    expect(firstScene.characters).toContain(raj!.charId);
    expect(firstScene.characters).not.toContain(raju!.charId);
    expect(secondScene.characters).toContain(raju!.charId);
    expect(secondScene.characters).not.toContain(raj!.charId);
  });

  it("marks characters unresolved when no artifacts match requested style", async () => {
    const res = await resolveCharacters({
      storyId: "style-mismatch-story",
      style: "paper-cut",
      characters: [
        {
          charId: "c_raju",
          name: "Raju",
          aliases: [],
          archetype: "hero"
        }
      ]
    });

    expect(res.resolvedCharacters).toHaveLength(0);
    expect(res.unresolvedCharacters).toHaveLength(1);
    expect(res.unresolvedCharacters[0]?.reason).toBe("No style-compatible artifact in registry");
  });

  it("accepts resolver characters without aliases by defaulting to empty list", async () => {
    const res = await resolveCharacters({
      storyId: "aliases-optional-story",
      style: "leather-shadow",
      characters: [
        {
          charId: "c_hero",
          name: "Raju",
          archetype: "hero"
        } as never
      ]
    });

    expect(res.resolvedCharacters[0]?.selectedArtifactId).toBeDefined();
  });

  it.each([
    {
      label: "storyId",
      input: { storyId: "", language: "en", text: "Raju met Elder." },
      message: "Invalid analyzeStory input: storyId is required and must be a non-empty string"
    },
    {
      label: "language",
      input: { storyId: "story-1", language: "   ", text: "Raju met Elder." },
      message: "Invalid analyzeStory input: language is required and must be a non-empty string"
    },
    {
      label: "text",
      input: { storyId: "story-1", language: "en", text: "" },
      message: "Invalid analyzeStory input: text is required and must be a non-empty string"
    }
  ])("rejects invalid %s input with clear message", async ({ input, message }) => {
    await expect(analyzeStory(input)).rejects.toThrow(message);
  });

  it.each([
    {
      label: "missing storyId",
      input: {
        storyId: "",
        style: "leather-shadow",
        characters: []
      },
      message: "Invalid resolveCharacters input: storyId is required and must be a non-empty string"
    },
    {
      label: "missing style",
      input: {
        storyId: "story-1",
        style: "",
        characters: []
      },
      message: "Invalid resolveCharacters input: style is required and must be a non-empty string"
    },
    {
      label: "characters not array",
      input: {
        storyId: "story-1",
        style: "leather-shadow",
        characters: null
      },
      message: "Invalid resolveCharacters input: characters must be an array"
    },
    {
      label: "character missing name",
      input: {
        storyId: "story-1",
        style: "leather-shadow",
        characters: [{ charId: "c1", name: "", aliases: [], archetype: "hero" }]
      },
      message: "Invalid resolveCharacters input: characters[0].name is required"
    }
  ])("rejects invalid resolve input: %s", async ({ input, message }) => {
    await expect(resolveCharacters(input as never)).rejects.toThrow(message);
  });
});
