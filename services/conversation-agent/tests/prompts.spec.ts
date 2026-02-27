import { describe, it, expect } from "vitest";
import {
  FOLKLORE_TEMPLATES,
  buildStoryGenerationPrompt,
  type FolkloreTradition
} from "../src/prompts.js";

const TRADITIONS: FolkloreTradition[] = [
  "chandamama",
  "panchatantra",
  "vikram_betaal",
  "tenali_raman",
  "regional"
];

// --- Expected use ---
describe("FOLKLORE_TEMPLATES", () => {
  it("has all 5 required traditions defined", () => {
    for (const tradition of TRADITIONS) {
      expect(FOLKLORE_TEMPLATES[tradition]).toBeDefined();
    }
  });

  it("each template has required fields", () => {
    for (const tradition of TRADITIONS) {
      const template = FOLKLORE_TEMPLATES[tradition];
      expect(typeof template.name).toBe("string");
      expect(typeof template.description).toBe("string");
      expect(typeof template.storyStructure).toBe("string");
      expect(Array.isArray(template.typicalCharacters)).toBe(true);
      expect(template.typicalCharacters.length).toBeGreaterThan(0);
      expect(typeof template.moralFramework).toBe("string");
      expect(typeof template.natyaScriptHints).toBe("string");
    }
  });
});

describe("buildStoryGenerationPrompt", () => {
  // --- Expected use ---
  it("includes the storyId in the prompt", () => {
    const prompt = buildStoryGenerationPrompt("chandamama", "Tell me a story about a prince", "story_123");
    expect(prompt).toContain("story_123");
  });

  it("includes the user request in the prompt", () => {
    const prompt = buildStoryGenerationPrompt("panchatantra", "A fable about a clever fox", "story_456");
    expect(prompt).toContain("A fable about a clever fox");
  });

  it("includes NatyaScript format instructions", () => {
    const prompt = buildStoryGenerationPrompt("chandamama", "Test request", "story_789");
    expect(prompt).toContain("SCENE_OPEN");
    expect(prompt).toContain("NARRATE");
    expect(prompt).toContain("storyState");
    expect(prompt).toContain("invocation");
    expect(prompt).toContain("temptation_peak");
    expect(prompt).toContain("restoration");
  });

  // --- Edge case ---
  it("includes the correct tradition name for each tradition", () => {
    for (const tradition of TRADITIONS) {
      const prompt = buildStoryGenerationPrompt(tradition, "Test", "story_x");
      const template = FOLKLORE_TEMPLATES[tradition];
      expect(prompt).toContain(template.name);
    }
  });

  // --- Failure case: prompts must reference both required JSON fields ---
  it("includes required JSON output field names in the prompt", () => {
    const prompt = buildStoryGenerationPrompt("chandamama", "Test", "story_abc");
    expect(prompt).toContain('"storyId"');
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"characters"');
    expect(prompt).toContain('"natyaScript"');
  });
});
