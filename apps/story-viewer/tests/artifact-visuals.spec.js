import { describe, expect, it } from "vitest";

import { buildArtifactVisualMap, normalizePreviewUrl } from "../web/artifactVisuals.js";

describe("artifact visuals", () => {
  it("normalizes relative preview URLs with provided origin", () => {
    expect(normalizePreviewUrl("/generated/hero.png", { origin: "http://127.0.0.1:8080" })).toBe(
      "http://127.0.0.1:8080/generated/hero.png"
    );
    expect(normalizePreviewUrl("https://cdn.example.test/hero.png", { origin: "http://localhost" })).toBe(
      "https://cdn.example.test/hero.png"
    );
  });

  it("builds selected artifact visual map from casting state", () => {
    const map = buildArtifactVisualMap(
      {
        order: ["c_hero", "c_mentor"],
        byCharId: {
          c_hero: {
            selectedCandidateId: "cand_hero_generated",
            existingCandidates: [
              {
                candidateId: "cand_hero_existing",
                artifactId: "hero_raju_v2",
                source: "existing",
                previewUrl: null
              }
            ],
            generatedCandidates: [
              {
                candidateId: "cand_hero_generated",
                artifactId: "raju_gen_v1",
                source: "generated",
                previewUrl: "/generated/raju_gen_v1.png"
              }
            ]
          },
          c_mentor: {
            selectedCandidateId: "cand_mentor_existing",
            existingCandidates: [
              {
                candidateId: "cand_mentor_existing",
                artifactId: "elder_mentor_v1",
                source: "existing",
                previewUrl: null
              }
            ],
            generatedCandidates: []
          }
        }
      },
      { origin: "http://127.0.0.1:8080" }
    );

    expect(map.raju_gen_v1?.previewUrl).toBe("http://127.0.0.1:8080/generated/raju_gen_v1.png");
    expect(map.raju_gen_v1?.source).toBe("generated");
    expect(map.elder_mentor_v1?.previewUrl).toBeNull();
  });

  it("returns empty map for malformed state", () => {
    expect(buildArtifactVisualMap(null)).toEqual({});
    expect(buildArtifactVisualMap({})).toEqual({});
  });
});
