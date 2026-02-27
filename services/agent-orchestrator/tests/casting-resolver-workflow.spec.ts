import { describe, expect, it, vi } from "vitest";

import { runCastingResolverWorkflow } from "../src/workflows/castingResolverWorkflow";

describe("casting resolver workflow", () => {
  it("builds prompt, calls gateway, and returns validated output", async () => {
    const gateway = {
      runJsonPrompt: vi.fn().mockResolvedValue({
        byCharId: {
          c_raju: ["hero_raju_v2", "hero_generic_v1"]
        },
        unresolvedCharIds: [],
        reasoning: {
          c_raju: "Matched hero archetype and name token."
        }
      })
    };

    const output = await runCastingResolverWorkflow(
      {
        storyId: "story-1",
        style: "leather-shadow",
        language: "en",
        text: "Raju meets Elder and faces his shadow.",
        characters: [{ charId: "c_raju", name: "Raju", aliases: [], archetype: "hero" }],
        availableArtifacts: [
          {
            artifactId: "hero_raju_v2",
            archetype: "hero",
            style: "leather-shadow",
            tags: ["raju", "hero"]
          }
        ]
      },
      gateway
    );

    expect(gateway.runJsonPrompt).toHaveBeenCalledTimes(1);
    expect(gateway.runJsonPrompt).toHaveBeenCalledWith(expect.stringContaining("story-1"));
    expect(gateway.runJsonPrompt).toHaveBeenCalledWith(expect.stringContaining("style: leather-shadow"));
    expect(gateway.runJsonPrompt).toHaveBeenCalledWith(expect.stringContaining("hero_raju_v2"));
    expect(output.byCharId.c_raju?.[0]).toBe("hero_raju_v2");
    expect(output.unresolvedCharIds).toEqual([]);
    expect(output.reasoning.c_raju).toMatch(/matched/i);
  });

  it("rejects invalid model output that does not match schema", async () => {
    const gateway = {
      runJsonPrompt: vi.fn().mockResolvedValue({
        byCharId: {
          c_raju: "hero_raju_v2"
        },
        unresolvedCharIds: [],
        reasoning: {}
      })
    };

    await expect(
      runCastingResolverWorkflow(
        {
          storyId: "story-1",
          style: "leather-shadow",
          language: "en",
          text: "Raju meets Elder and faces his shadow.",
          characters: [{ charId: "c_raju", name: "Raju", aliases: [], archetype: "hero" }],
          availableArtifacts: [
            {
              artifactId: "hero_raju_v2",
              archetype: "hero",
              style: "leather-shadow",
              tags: ["raju", "hero"]
            }
          ]
        },
        gateway
      )
    ).rejects.toThrow(/casting resolver response/i);
  });

  it("rejects model output when required fields are missing", async () => {
    const gateway = {
      runJsonPrompt: vi.fn().mockResolvedValue({
        byCharId: {
          c_raju: ["hero_raju_v2"]
        },
        reasoning: {
          c_raju: "Looks right"
        }
      })
    };

    await expect(
      runCastingResolverWorkflow(
        {
          storyId: "story-1",
          style: "leather-shadow",
          language: "en",
          text: "Raju meets Elder and faces his shadow.",
          characters: [{ charId: "c_raju", name: "Raju", aliases: [], archetype: "hero" }],
          availableArtifacts: [
            {
              artifactId: "hero_raju_v2",
              archetype: "hero",
              style: "leather-shadow",
              tags: ["raju", "hero"]
            }
          ]
        },
        gateway
      )
    ).rejects.toThrow(/casting resolver response/i);
  });
});
