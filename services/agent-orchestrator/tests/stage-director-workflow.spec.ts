import { describe, expect, it } from "vitest";

import { buildStageDirectorPlan } from "../src/workflows/stageDirectorWorkflow";

describe("stage director workflow", () => {
  it("selects primary artifact from approved hero cast", () => {
    const plan = buildStageDirectorPlan({
      resolvedCharacters: [
        {
          charId: "c_hero_raju",
          selectedArtifactId: "hero_default"
        }
      ],
      castSelections: [
        {
          charId: "c_hero_raju",
          artifactId: "hero_custom"
        }
      ]
    });

    expect(plan.primaryArtifactId).toBe("hero_custom");
  });

  it("falls back deterministically when hero selection is unavailable", () => {
    const plan = buildStageDirectorPlan({
      resolvedCharacters: [
        {
          charId: "c_raju",
          selectedArtifactId: "hero_raju_default"
        },
        {
          charId: "c_elder",
          selectedArtifactId: "elder_default"
        }
      ],
      castSelections: [
        {
          charId: "c_elder",
          artifactId: "elder_custom"
        }
      ]
    });

    expect(plan.primaryArtifactId).toBe("elder_custom");
  });

  it("matches cast selections when resolved charIds use c_ prefixes", () => {
    const plan = buildStageDirectorPlan({
      resolvedCharacters: [
        {
          charId: "c_raju",
          selectedArtifactId: "hero_raju_default"
        }
      ],
      castSelections: [
        {
          charId: "raju",
          artifactId: "hero_raju_custom"
        }
      ]
    });

    expect(plan.primaryArtifactId).toBe("hero_raju_custom");
  });

  it("throws when no resolved characters are available", () => {
    expect(() =>
      buildStageDirectorPlan({
        resolvedCharacters: [],
        castSelections: []
      })
    ).toThrow("Unable to build stage plan: no primary artifact");
  });

  it("falls back to first cast selection when no resolved characters exist", () => {
    const plan = buildStageDirectorPlan({
      resolvedCharacters: [],
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "raju_custom"
        },
        {
          charId: "c_elder",
          artifactId: "elder_custom"
        }
      ]
    });

    expect(plan.primaryArtifactId).toBe("raju_custom");
  });
});
