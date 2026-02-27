import { afterEach, describe, expect, it, vi } from "vitest";

import type { StitchClient } from "../src/integrations/stitchClient";
import { generateCastingCandidates } from "../src/routes/generateCastingCandidates";

describe("casting generate", () => {
  afterEach(() => {
    delete process.env.AGENTIC_CASTING_ENABLED;
  });

  it("generates candidate set for one character using stitch adapter", async () => {
    const fakeClient = {
      generateCharacterParts: vi.fn().mockResolvedValue([
        {
          candidateId: "cand_1",
          artifactId: "hero_raju_gen_1",
          previewUrl: "/generated/hero_raju_gen_1.png",
          source: "generated",
          partsManifest: {
            parts: ["head", "torso"]
          }
        }
      ])
    };

    const response = await generateCastingCandidates(
      {
        storyId: "story_casting_1",
        style: "leather-shadow",
        character: {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero"
        }
      },
      fakeClient
    );

    expect(fakeClient.generateCharacterParts).toHaveBeenCalledTimes(1);
    expect(response.generatedCandidates).toHaveLength(1);
    expect(response.generatedCandidates[0]?.artifactId).toBe("hero_raju_gen_1");
    expect(response.generatedCandidates[0]?.source).toBe("generated");
  });

  it("uses artifact generation workflow path when AGENTIC_CASTING_ENABLED is true", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "true";

    const generateCharacterParts = vi
      .fn<StitchClient["generateCharacterParts"]>()
      .mockResolvedValue([
        {
          candidateId: "cand_direct_unused",
          artifactId: "hero_raju_direct",
          previewUrl: "/generated/hero_raju_direct.png",
          source: "generated",
          partsManifest: {
            parts: ["head"]
          }
        }
      ]);
    const fakeClient = {
      generateCharacterParts
    } satisfies StitchClient;

    const runArtifactWorkflow = vi.fn().mockResolvedValue({
      storyId: "story_casting_workflow_1",
      character: {
        charId: "c_raju",
        name: "Raju",
        archetype: "hero"
      },
      generatedCandidates: [
        {
          candidateId: "cand_agentic_1",
          artifactId: "hero_raju_agentic",
          previewUrl: "/generated/hero_raju_agentic.png",
          source: "generated",
          partsManifest: {
            parts: ["head", "torso"]
          }
        }
      ]
    });

    const response = await generateCastingCandidates(
      {
        storyId: "story_casting_workflow_1",
        style: "leather-shadow",
        character: {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero"
        }
      },
      fakeClient,
      {
        runArtifactWorkflow
      }
    );

    expect(runArtifactWorkflow).toHaveBeenCalledTimes(1);
    expect(fakeClient.generateCharacterParts).not.toHaveBeenCalled();
    expect(response.generatedCandidates[0]?.artifactId).toBe("hero_raju_agentic");
  });

  it("falls back to direct stitch client path when agentic workflow throws", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "true";

    const generateCharacterParts = vi
      .fn<StitchClient["generateCharacterParts"]>()
      .mockResolvedValue([
        {
          candidateId: "cand_direct_1",
          artifactId: "hero_raju_direct",
          previewUrl: "/generated/hero_raju_direct.png",
          source: "generated",
          partsManifest: {
            parts: ["head", "torso"]
          }
        }
      ]);
    const fakeClient = {
      generateCharacterParts
    } satisfies StitchClient;

    const runArtifactWorkflow = vi
      .fn()
      .mockRejectedValue(new Error("agent workflow unavailable"));

    const response = await generateCastingCandidates(
      {
        storyId: "story_casting_workflow_fallback_1",
        style: "leather-shadow",
        character: {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero"
        }
      },
      fakeClient,
      {
        runArtifactWorkflow
      }
    );

    expect(runArtifactWorkflow).toHaveBeenCalledTimes(1);
    expect(fakeClient.generateCharacterParts).toHaveBeenCalledTimes(1);
    expect(fakeClient.generateCharacterParts).toHaveBeenCalledWith({
      storyId: "story_casting_workflow_fallback_1",
      style: "leather-shadow",
      character: {
        charId: "c_raju",
        name: "Raju",
        archetype: "hero"
      }
    });
    expect(response.generatedCandidates[0]?.artifactId).toBe("hero_raju_direct");
  });

  it("passes exact normalized input payload to workflow and keeps response identity from validated input", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "true";

    const generateCharacterParts = vi
      .fn<StitchClient["generateCharacterParts"]>()
      .mockResolvedValue([]);
    const fakeClient = {
      generateCharacterParts
    } satisfies StitchClient;

    const runArtifactWorkflow = vi.fn().mockResolvedValue({
      storyId: "workflow_story_id_that_must_not_leak",
      character: {
        charId: "workflow_char_id",
        name: "Workflow Name",
        archetype: "workflow-archetype"
      },
      generatedCandidates: [
        {
          candidateId: "cand_agentic_2",
          artifactId: "hero_raju_agentic_2",
          previewUrl: "/generated/hero_raju_agentic_2.png",
          source: "generated",
          partsManifest: {
            parts: ["head"]
          }
        }
      ]
    });

    const response = await generateCastingCandidates(
      {
        storyId: "  story_input_identity_1  ",
        style: "  leather-shadow  ",
        character: {
          charId: "  c_raju  ",
          name: "  Raju  ",
          archetype: "  hero  "
        }
      },
      fakeClient,
      {
        runArtifactWorkflow
      }
    );

    expect(runArtifactWorkflow).toHaveBeenCalledTimes(1);
    expect(runArtifactWorkflow).toHaveBeenCalledWith(
      {
        storyId: "story_input_identity_1",
        style: "leather-shadow",
        character: {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero"
        }
      },
      fakeClient
    );
    expect(fakeClient.generateCharacterParts).not.toHaveBeenCalled();
    expect(response.storyId).toBe("story_input_identity_1");
    expect(response.character).toEqual({
      charId: "c_raju",
      name: "Raju",
      archetype: "hero"
    });
    expect(response.generatedCandidates[0]?.artifactId).toBe("hero_raju_agentic_2");
  });

  it("falls back to direct stitch client path when AGENTIC_CASTING_ENABLED is false", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "false";

    const fakeClient = {
      generateCharacterParts: vi.fn().mockResolvedValue([
        {
          candidateId: "cand_direct_1",
          artifactId: "hero_raju_direct",
          previewUrl: "/generated/hero_raju_direct.png",
          source: "generated",
          partsManifest: {
            parts: ["head", "torso"]
          }
        }
      ])
    };

    const runArtifactWorkflow = vi.fn().mockResolvedValue({
      storyId: "story_casting_direct_1",
      character: {
        charId: "c_raju",
        name: "Raju",
        archetype: "hero"
      },
      generatedCandidates: []
    });

    const response = await generateCastingCandidates(
      {
        storyId: "story_casting_direct_1",
        style: "leather-shadow",
        character: {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero"
        }
      },
      fakeClient,
      {
        runArtifactWorkflow
      }
    );

    expect(fakeClient.generateCharacterParts).toHaveBeenCalledTimes(1);
    expect(runArtifactWorkflow).not.toHaveBeenCalled();
    expect(response.generatedCandidates[0]?.artifactId).toBe("hero_raju_direct");
  });

  it("uses default stitch stub client when no adapter is injected", async () => {
    const response = await generateCastingCandidates({
      storyId: "story_casting_2",
      style: "leather-shadow",
      character: {
        charId: "c_elder",
        name: "Elder",
        archetype: "mentor"
      }
    });

    expect(response.generatedCandidates.length).toBeGreaterThan(0);
    expect(response.generatedCandidates[0]?.source).toBe("generated");
  });

  it("returns independent parts arrays across calls", async () => {
    const first = await generateCastingCandidates({
      storyId: "story_casting_3",
      style: "leather-shadow",
      character: {
        charId: "c_raju",
        name: "Raju",
        archetype: "hero"
      }
    });

    first.generatedCandidates[0]?.partsManifest.parts.push("mutated_part");

    const second = await generateCastingCandidates({
      storyId: "story_casting_4",
      style: "leather-shadow",
      character: {
        charId: "c_raju",
        name: "Raju",
        archetype: "hero"
      }
    });

    expect(second.generatedCandidates[0]?.partsManifest.parts).not.toContain("mutated_part");
  });
});
