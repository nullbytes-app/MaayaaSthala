import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareCasting } from "../src/routes/prepareCasting";

describe("casting prepare", () => {
  afterEach(() => {
    delete process.env.AGENTIC_CASTING_ENABLED;
    delete process.env.AGENTIC_ANALYZE_ENABLED;
  });

  it("returns per-character existing casting candidates", async () => {
    const body = await prepareCasting({
      storyId: "story_casting_1",
      style: " leather-shadow ",
      text: "Raju meets Elder and faces his shadow."
    });

    expect(body.storyId).toBe("story_casting_1");
    expect(body.language).toBe("en");
    expect(body.characters.length).toBeGreaterThan(0);
    expect(body.characters[0]?.existingCandidates.length).toBeGreaterThan(0);

    const firstCharacterCandidates = body.characters[0]?.existingCandidates ?? [];
    expect(firstCharacterCandidates.every((candidate) => candidate.source === "existing")).toBe(true);
    expect(
      firstCharacterCandidates.every(
        (candidate) => candidate.confidence >= 0 && candidate.confidence <= 1
      )
    ).toBe(true);
    expect(firstCharacterCandidates.map((candidate) => candidate.confidence)).toEqual(
      [...firstCharacterCandidates.map((candidate) => candidate.confidence)].sort((a, b) => b - a)
    );
  });

  it("returns empty candidate arrays when style has no compatible artifacts", async () => {
    const body = await prepareCasting({
      storyId: "story_casting_2",
      style: "paper-cut",
      text: "Raju meets Elder and faces his shadow."
    });

    expect(body.characters.every((character) => character.existingCandidates.length === 0)).toBe(true);
  });

  it("uses workflow ranking when AGENTIC_CASTING_ENABLED is true", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "true";

    const runCastingWorkflow = vi.fn().mockResolvedValue({
      byCharId: {
        c_raju: ["hero_generic_v1", "hero_raju_v2"]
      },
      unresolvedCharIds: [],
      reasoning: {
        c_raju: "Prefer generic silhouette for first-pass composition."
      }
    });

    const body = await prepareCasting(
      {
        storyId: "story_casting_ranked_1",
        style: "leather-shadow",
        text: "Raju meets Elder and faces his shadow."
      },
      {
        runCastingWorkflow,
        castingGateway: {
          runJsonPrompt: vi.fn().mockResolvedValue({})
        }
      }
    );

    expect(runCastingWorkflow).toHaveBeenCalledTimes(1);
    const raju = body.characters.find((character) => character.charId === "c_raju");
    expect(raju?.existingCandidates[0]?.artifactId).toBe("hero_generic_v1");
    expect(raju?.existingCandidates[1]?.artifactId).toBe("hero_raju_v2");
  });

  it("falls back to score-based ranking when workflow fails", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "true";
    const onWarning = vi.fn();

    const body = await prepareCasting(
      {
        storyId: "story_casting_fallback_1",
        style: "leather-shadow",
        text: "Raju meets Elder and faces his shadow."
      },
      {
        runCastingWorkflow: vi.fn().mockRejectedValue(new Error("gateway unavailable")),
        castingGateway: {
          runJsonPrompt: vi.fn().mockResolvedValue({})
        },
        onWarning
      }
    );

    const raju = body.characters.find((character) => character.charId === "c_raju");
    expect(raju?.existingCandidates[0]?.artifactId).toBe("hero_raju_v2");
    expect(onWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story_casting_fallback_1",
        agenticCastingEnabled: true,
        reason: "casting_workflow_failed",
        errorMessage: "gateway unavailable"
      })
    );
  });

  it("keeps baseline ranking for unresolved characters", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "true";

    const baseline = await prepareCasting({
      storyId: "story_casting_unresolved_baseline_1",
      style: "leather-shadow",
      text: "Raju meets Elder and faces his shadow."
    });

    const runCastingWorkflow = vi.fn().mockResolvedValue({
      byCharId: {
        c_raju: ["hero_generic_v1", "hero_raju_v2"]
      },
      unresolvedCharIds: ["c_raju"],
      reasoning: {
        c_raju: "Insufficient confidence in top ordering."
      }
    });

    const body = await prepareCasting(
      {
        storyId: "story_casting_unresolved_ranked_1",
        style: "leather-shadow",
        text: "Raju meets Elder and faces his shadow."
      },
      {
        runCastingWorkflow,
        castingGateway: {
          runJsonPrompt: vi.fn().mockResolvedValue({})
        }
      }
    );

    const baselineRaju = baseline.characters.find((character) => character.charId === "c_raju");
    const rankedRaju = body.characters.find((character) => character.charId === "c_raju");

    expect(rankedRaju?.existingCandidates.map((candidate) => candidate.artifactId)).toEqual(
      baselineRaju?.existingCandidates.map((candidate) => candidate.artifactId)
    );
    expect(runCastingWorkflow).toHaveBeenCalledTimes(1);
  });

  it("handles duplicate and unknown workflow artifact IDs deterministically", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "true";

    const baseline = await prepareCasting({
      storyId: "story_casting_ranked_duplicates_baseline_1",
      style: "leather-shadow",
      text: "Raju meets Elder and faces his shadow."
    });
    const baselineRajuIds =
      baseline.characters.find((character) => character.charId === "c_raju")?.existingCandidates.map(
        (candidate) => candidate.artifactId
      ) ?? [];

    const runCastingWorkflow = vi.fn().mockResolvedValue({
      byCharId: {
        c_raju: ["hero_generic_v1", "unknown_artifact", "hero_generic_v1", "hero_raju_v2"]
      },
      unresolvedCharIds: [],
      reasoning: {
        c_raju: "Model repeated one candidate and included one stale id."
      }
    });

    const body = await prepareCasting(
      {
        storyId: "story_casting_ranked_duplicates_1",
        style: "leather-shadow",
        text: "Raju meets Elder and faces his shadow."
      },
      {
        runCastingWorkflow,
        castingGateway: {
          runJsonPrompt: vi.fn().mockResolvedValue({})
        }
      }
    );

    const rankedRajuIds =
      body.characters.find((character) => character.charId === "c_raju")?.existingCandidates.map(
        (candidate) => candidate.artifactId
      ) ?? [];

    const expectedOrder = [
      "hero_generic_v1",
      ...baselineRajuIds.filter((artifactId) => artifactId !== "hero_generic_v1")
    ];

    expect(rankedRajuIds).toEqual(expectedOrder);
    expect(rankedRajuIds).not.toContain("unknown_artifact");
  });

  it("falls back and emits warning when agentic casting is enabled without gateway", async () => {
    process.env.AGENTIC_CASTING_ENABLED = "true";

    const baseline = await prepareCasting({
      storyId: "story_casting_no_gateway_baseline_1",
      style: "leather-shadow",
      text: "Raju meets Elder and faces his shadow."
    });

    const onWarning = vi.fn();
    const runCastingWorkflow = vi.fn().mockResolvedValue({
      byCharId: {
        c_raju: ["hero_generic_v1", "hero_raju_v2"]
      },
      unresolvedCharIds: [],
      reasoning: {
        c_raju: "Should not execute when gateway is missing."
      }
    });

    const body = await prepareCasting(
      {
        storyId: "story_casting_no_gateway_ranked_1",
        style: "leather-shadow",
        text: "Raju meets Elder and faces his shadow."
      },
      {
        runCastingWorkflow,
        onWarning
      }
    );

    const baselineRajuIds =
      baseline.characters.find((character) => character.charId === "c_raju")?.existingCandidates.map(
        (candidate) => candidate.artifactId
      ) ?? [];
    const actualRajuIds =
      body.characters.find((character) => character.charId === "c_raju")?.existingCandidates.map(
        (candidate) => candidate.artifactId
      ) ?? [];

    expect(runCastingWorkflow).not.toHaveBeenCalled();
    expect(actualRajuIds).toEqual(baselineRajuIds);
    expect(onWarning).toHaveBeenCalledWith({
      storyId: "story_casting_no_gateway_ranked_1",
      agenticCastingEnabled: true,
      reason: "casting_gateway_not_configured"
    });
  });

  it("uses agentic analyze workflow characters when deps are provided", async () => {
    process.env.AGENTIC_ANALYZE_ENABLED = "true";

    const runStoryWorkflow = vi.fn().mockResolvedValue({
      storyId: "story_casting_agentic_analyze_1",
      characters: [
        {
          charId: "c_luna",
          name: "Luna",
          aliases: ["Moon Scout"],
          archetype: "hero"
        }
      ],
      scenes: [
        {
          sceneId: "s1",
          characters: ["c_luna"],
          summary: "Luna surveys the valley."
        }
      ]
    });

    const body = await prepareCasting(
      {
        storyId: "story_casting_agentic_analyze_1",
        style: "leather-shadow",
        text: "Luna surveys the valley."
      },
      {
        storyGateway: {
          runJsonPrompt: vi.fn().mockResolvedValue({})
        },
        runStoryWorkflow
      }
    );

    expect(runStoryWorkflow).toHaveBeenCalledTimes(1);
    expect(body.characters).toHaveLength(1);
    expect(body.characters[0]?.charId).toBe("c_luna");
    expect(body.scenes).toEqual([
      {
        sceneId: "s1",
        characters: ["c_luna"],
        summary: "Luna surveys the valley."
      }
    ]);
  });
});
