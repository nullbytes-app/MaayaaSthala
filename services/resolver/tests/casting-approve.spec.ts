import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSessionArtifactMaps,
  getSessionArtifactMap
} from "../src/domain/castingSessionStore";
import { approveCasting } from "../src/routes/approveCasting";

describe("casting approve", () => {
  beforeEach(() => {
    clearSessionArtifactMaps();
  });

  it("stores approved cast and returns session artifact map", async () => {
    const response = await approveCasting({
      storyId: "story_casting_approve_1",
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_v2",
          source: "existing"
        }
      ]
    });

    expect(response.storyId).toBe("story_casting_approve_1");
    expect(response.sessionArtifactMap.castSelections[0]?.artifactId).toBe("hero_raju_v2");

    const stored = getSessionArtifactMap("story_casting_approve_1");
    expect(stored?.castSelections[0]?.charId).toBe("c_raju");
  });

  it("stores and returns independent session map objects", async () => {
    const response = await approveCasting({
      storyId: "story_casting_approve_immutability",
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_v2",
          source: "existing"
        }
      ]
    });

    response.sessionArtifactMap.castSelections[0]!.artifactId = "mutated_artifact";

    const stored = getSessionArtifactMap("story_casting_approve_immutability");
    expect(stored?.castSelections[0]?.artifactId).toBe("hero_raju_v2");
  });

  it("rejects empty cast selection input", async () => {
    await expect(
      approveCasting({
        storyId: "story_casting_approve_2",
        castSelections: []
      })
    ).rejects.toThrow("Invalid approveCasting input: castSelections must be a non-empty array");
  });

  it("rejects duplicate character selections", async () => {
    await expect(
      approveCasting({
        storyId: "story_casting_approve_3",
        castSelections: [
          {
            charId: "c_raju",
            artifactId: "hero_raju_v2",
            source: "existing"
          },
          {
            charId: "c_raju",
            artifactId: "hero_raju_gen_1",
            source: "generated"
          }
        ]
      })
    ).rejects.toThrow("Invalid approveCasting input: castSelections contains duplicate charId: c_raju");
  });
});
