import { describe, expect, it, vi } from "vitest";

import type { StitchClient } from "../../resolver/src/integrations/stitchClient";
import { runArtifactGenerationWorkflow } from "../src/workflows/artifactGenerationWorkflow";

describe("artifact generation workflow", () => {
  it("delegates generation to stitch client and returns route-compatible shape", async () => {
    const generateCharacterParts = vi
      .fn<StitchClient["generateCharacterParts"]>()
      .mockResolvedValue([
        {
          candidateId: "cand_1",
          artifactId: "hero_raju_v1",
          previewUrl: "/generated/hero_raju_v1.png",
          source: "generated",
          partsManifest: {
            parts: ["head", "torso"]
          }
        }
      ]);
    const stitchClient = {
      generateCharacterParts
    } satisfies StitchClient;

    const output = await runArtifactGenerationWorkflow(
      {
        storyId: "story_1",
        style: "leather-shadow",
        character: {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero"
        }
      },
      stitchClient
    );

    expect(stitchClient.generateCharacterParts).toHaveBeenCalledTimes(1);
    expect(stitchClient.generateCharacterParts).toHaveBeenCalledWith({
      storyId: "story_1",
      style: "leather-shadow",
      character: {
        charId: "c_raju",
        name: "Raju",
        archetype: "hero"
      }
    });
    expect(output).toEqual({
      storyId: "story_1",
      character: {
        charId: "c_raju",
        name: "Raju",
        archetype: "hero"
      },
      generatedCandidates: [
        {
          candidateId: "cand_1",
          artifactId: "hero_raju_v1",
          previewUrl: "/generated/hero_raju_v1.png",
          source: "generated",
          partsManifest: {
            parts: ["head", "torso"]
          }
        }
      ]
    });
  });
});
