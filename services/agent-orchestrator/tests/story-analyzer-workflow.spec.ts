import { describe, expect, it, vi } from "vitest";

import { runStoryAnalyzerWorkflow } from "../src/workflows/storyAnalyzerWorkflow";

describe("story analyzer workflow", () => {
  it("builds prompt, calls gateway, and returns validated output", async () => {
    const gateway = {
      runJsonPrompt: vi.fn().mockResolvedValue({
        storyId: "story-1",
        characters: [
          {
            charId: "c_raju",
            name: "Raju",
            aliases: ["Raj"],
            archetype: "hero"
          }
        ],
        scenes: [
          {
            sceneId: "s1",
            characters: ["c_raju"],
            summary: "Raju enters the village."
          }
        ]
      })
    };

    const result = await runStoryAnalyzerWorkflow(
      {
        storyId: "story-1",
        language: "en",
        text: "Raju enters the village."
      },
      gateway
    );

    expect(gateway.runJsonPrompt).toHaveBeenCalledTimes(1);
    expect(gateway.runJsonPrompt).toHaveBeenCalledWith(expect.stringContaining("story-1"));
    expect(gateway.runJsonPrompt).toHaveBeenCalledWith(expect.stringContaining("language: en"));
    expect(result).toEqual({
      storyId: "story-1",
      characters: [
        {
          charId: "c_raju",
          name: "Raju",
          aliases: ["Raj"],
          archetype: "hero"
        }
      ],
      scenes: [
        {
          sceneId: "s1",
          characters: ["c_raju"],
          summary: "Raju enters the village."
        }
      ]
    });
  });

  it("rejects invalid model output that does not match schema", async () => {
    const gateway = {
      runJsonPrompt: vi.fn().mockResolvedValue({
        storyId: "story-1",
        characters: [
          {
            charId: "c_raju",
            name: "Raju",
            aliases: "Raj",
            archetype: "hero"
          }
        ],
        scenes: []
      })
    };

    await expect(
      runStoryAnalyzerWorkflow(
        {
          storyId: "story-1",
          language: "en",
          text: "Raju enters the village."
        },
        gateway
      )
    ).rejects.toThrow(/story analyzer response/i);
  });
});
