import { describe, expect, it, vi } from "vitest";

import { analyzeStory, isAgenticAnalyzeEnabled } from "../src/routes/analyzeStory";
import { isAgenticCastingEnabled } from "../src/routes/prepareCasting";
import { isAgenticRunEnabled } from "../src/routes/runDemo";

describe("agentic flag helpers", () => {
  describe("isAgenticAnalyzeEnabled", () => {
    it("returns true only for true", () => {
      expect(isAgenticAnalyzeEnabled({ AGENTIC_ANALYZE_ENABLED: "true" })).toBe(true);
      expect(isAgenticAnalyzeEnabled({ AGENTIC_ANALYZE_ENABLED: " TRUE " })).toBe(true);
    });

    it("returns false for non-true values", () => {
      expect(isAgenticAnalyzeEnabled({ AGENTIC_ANALYZE_ENABLED: "false" })).toBe(false);
      expect(isAgenticAnalyzeEnabled({ AGENTIC_ANALYZE_ENABLED: "1" })).toBe(false);
      expect(isAgenticAnalyzeEnabled({ AGENTIC_ANALYZE_ENABLED: undefined })).toBe(false);
    });

    it("keeps legacy path when analyze flag is disabled", async () => {
      const runStoryWorkflow = vi.fn().mockResolvedValue({
        storyId: "story-agentic-disabled",
        characters: [],
        scenes: []
      });

      const result = await analyzeStory(
        {
          storyId: "story-agentic-disabled",
          language: "en",
          text: "Raju met Elder."
        },
        {
          env: { AGENTIC_ANALYZE_ENABLED: "false" },
          runStoryWorkflow,
          storyGateway: {
            runJsonPrompt: vi.fn().mockResolvedValue({})
          }
        }
      );

      expect(runStoryWorkflow).not.toHaveBeenCalled();
      expect(result.storyId).toBe("story-agentic-disabled");
      expect(Array.isArray(result.characters)).toBe(true);
      expect(Array.isArray(result.scenes)).toBe(true);
    });

    it("uses agentic workflow when analyze flag is enabled", async () => {
      const runStoryWorkflow = vi.fn().mockResolvedValue({
        storyId: "story-agentic-enabled",
        characters: [
          {
            charId: "c_raju",
            name: "Raju",
            aliases: [],
            archetype: "hero"
          }
        ],
        scenes: [
          {
            sceneId: "s1",
            characters: ["c_raju"],
            summary: "Raju begins his vow."
          }
        ]
      });

      const result = await analyzeStory(
        {
          storyId: "story-agentic-enabled",
          language: "en",
          text: "Raju begins his vow."
        },
        {
          env: { AGENTIC_ANALYZE_ENABLED: "true" },
          runStoryWorkflow,
          storyGateway: {
            runJsonPrompt: vi.fn().mockResolvedValue({})
          }
        }
      );

      expect(runStoryWorkflow).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        storyId: "story-agentic-enabled",
        characters: [
          {
            charId: "c_raju",
            name: "Raju",
            aliases: [],
            archetype: "hero"
          }
        ],
        scenes: [
          {
            sceneId: "s1",
            characters: ["c_raju"],
            summary: "Raju begins his vow."
          }
        ]
      });
    });

    it("falls back to legacy analysis when agentic workflow fails", async () => {
      const runStoryWorkflow = vi.fn().mockRejectedValue(new Error("workflow unavailable"));

      const result = await analyzeStory(
        {
          storyId: "story-agentic-fallback",
          language: "en",
          text: "Raju met Elder."
        },
        {
          env: { AGENTIC_ANALYZE_ENABLED: "true" },
          runStoryWorkflow,
          storyGateway: {
            runJsonPrompt: vi.fn().mockResolvedValue({})
          }
        }
      );

      expect(runStoryWorkflow).toHaveBeenCalledTimes(1);
      expect(result.storyId).toBe("story-agentic-fallback");
      expect(result.characters.length).toBeGreaterThan(0);
      expect(result.scenes.length).toBeGreaterThan(0);
    });

    it("falls back to legacy analysis when gateway is missing", async () => {
      const runStoryWorkflow = vi.fn().mockResolvedValue({
        storyId: "should-not-run",
        characters: [],
        scenes: []
      });

      const result = await analyzeStory(
        {
          storyId: "story-agentic-no-gateway",
          language: "en",
          text: "Raju met Elder."
        },
        {
          env: { AGENTIC_ANALYZE_ENABLED: "true" },
          runStoryWorkflow
        }
      );

      expect(runStoryWorkflow).not.toHaveBeenCalled();
      expect(result.storyId).toBe("story-agentic-no-gateway");
      expect(result.characters.length).toBeGreaterThan(0);
      expect(result.scenes.length).toBeGreaterThan(0);
    });
  });

  describe("isAgenticCastingEnabled", () => {
    it("returns true only for true", () => {
      expect(isAgenticCastingEnabled({ AGENTIC_CASTING_ENABLED: "true" })).toBe(true);
      expect(isAgenticCastingEnabled({ AGENTIC_CASTING_ENABLED: " TrUe " })).toBe(true);
    });

    it("returns false for non-true values", () => {
      expect(isAgenticCastingEnabled({ AGENTIC_CASTING_ENABLED: "false" })).toBe(false);
      expect(isAgenticCastingEnabled({ AGENTIC_CASTING_ENABLED: "yes" })).toBe(false);
      expect(isAgenticCastingEnabled({ AGENTIC_CASTING_ENABLED: undefined })).toBe(false);
    });
  });

  describe("isAgenticRunEnabled", () => {
    it("returns true only for true", () => {
      expect(isAgenticRunEnabled({ AGENTIC_RUN_ENABLED: "true" })).toBe(true);
      expect(isAgenticRunEnabled({ AGENTIC_RUN_ENABLED: " TrUe " })).toBe(true);
    });

    it("returns false for non-true values", () => {
      expect(isAgenticRunEnabled({ AGENTIC_RUN_ENABLED: "false" })).toBe(false);
      expect(isAgenticRunEnabled({ AGENTIC_RUN_ENABLED: "yes" })).toBe(false);
      expect(isAgenticRunEnabled({ AGENTIC_RUN_ENABLED: undefined })).toBe(false);
    });
  });
});
