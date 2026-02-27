import { describe, expect, it } from "vitest";

import {
  buildApprovePayload,
  initialCastingState,
  reduceCastingState
} from "../web/castingStudio.js";

describe("casting studio state", () => {
  it("tracks selected candidate per character", () => {
    const loaded = reduceCastingState(initialCastingState, {
      type: "loadPrepareSuccess",
      storyId: "story_state_1",
      characters: [
        {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero",
          existingCandidates: [{ artifactId: "hero_raju_v2", source: "existing", confidence: 0.9 }]
        }
      ]
    });

    const state = reduceCastingState(loaded, {
      type: "selectCandidate",
      charId: "c_raju",
      candidateId: "hero_raju_v2"
    });

    expect(state.byCharId.c_raju.selectedCandidateId).toBe("hero_raju_v2");
  });

  it("merges generated candidates and keeps existing selection", () => {
    const loaded = reduceCastingState(initialCastingState, {
      type: "loadPrepareSuccess",
      storyId: "story_state_2",
      characters: [
        {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero",
          existingCandidates: [{ artifactId: "hero_raju_v2", source: "existing", confidence: 0.9 }]
        }
      ]
    });

    const merged = reduceCastingState(loaded, {
      type: "mergeGeneratedCandidates",
      charId: "c_raju",
      generatedCandidates: [
        {
          candidateId: "cand_1",
          artifactId: "hero_raju_gen_1",
          source: "generated",
          previewUrl: "/generated/hero_raju_gen_1.png"
        }
      ]
    });

    expect(merged.byCharId.c_raju.generatedCandidates).toHaveLength(1);
    expect(merged.byCharId.c_raju.selectedCandidateId).toBe("hero_raju_v2");
  });

  it("appends generated candidates across multiple merges", () => {
    const loaded = reduceCastingState(initialCastingState, {
      type: "loadPrepareSuccess",
      storyId: "story_state_4",
      characters: [
        {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero",
          existingCandidates: [{ artifactId: "hero_raju_v2", source: "existing", confidence: 0.9 }]
        }
      ]
    });

    const afterFirstMerge = reduceCastingState(loaded, {
      type: "mergeGeneratedCandidates",
      charId: "c_raju",
      generatedCandidates: [
        {
          candidateId: "cand_1",
          artifactId: "hero_raju_gen_1",
          source: "generated"
        }
      ]
    });

    const afterSecondMerge = reduceCastingState(afterFirstMerge, {
      type: "mergeGeneratedCandidates",
      charId: "c_raju",
      generatedCandidates: [
        {
          candidateId: "cand_2",
          artifactId: "hero_raju_gen_2",
          source: "generated"
        }
      ]
    });

    expect(afterSecondMerge.byCharId.c_raju.generatedCandidates).toHaveLength(2);
    expect(
      afterSecondMerge.byCharId.c_raju.generatedCandidates.map((candidate) => candidate.candidateId)
    ).toEqual(["cand_1", "cand_2"]);
  });

  it("falls back to a valid selection when selected candidate is stale", () => {
    const loaded = reduceCastingState(initialCastingState, {
      type: "loadPrepareSuccess",
      storyId: "story_state_5",
      characters: [
        {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero",
          existingCandidates: [{ artifactId: "hero_raju_v2", source: "existing", confidence: 0.9 }]
        }
      ]
    });

    const corrupted = {
      ...loaded,
      byCharId: {
        ...loaded.byCharId,
        c_raju: {
          ...loaded.byCharId.c_raju,
          selectedCandidateId: "stale_candidate"
        }
      }
    };

    const repaired = reduceCastingState(corrupted, {
      type: "mergeGeneratedCandidates",
      charId: "c_raju",
      generatedCandidates: []
    });

    expect(repaired.byCharId.c_raju.selectedCandidateId).toBe("hero_raju_v2");
  });

  it("builds approve payload from current selections", () => {
    const loaded = reduceCastingState(initialCastingState, {
      type: "loadPrepareSuccess",
      storyId: "story_state_3",
      characters: [
        {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero",
          existingCandidates: [{ artifactId: "hero_raju_v2", source: "existing", confidence: 0.9 }]
        }
      ]
    });

    const payload = buildApprovePayload(loaded);
    expect(payload.storyId).toBe("story_state_3");
    expect(payload.castSelections).toEqual([
      {
        charId: "c_raju",
        artifactId: "hero_raju_v2",
        source: "existing"
      }
    ]);
  });
});
