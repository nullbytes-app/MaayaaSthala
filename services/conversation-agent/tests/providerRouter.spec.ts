import { describe, it, expect } from "vitest";
import { routeCharacterGeneration } from "../src/providerRouter.js";
import type { CharacterGenerationRequest } from "../src/types.js";

const heroRequest: CharacterGenerationRequest = {
  charId: "c_hero",
  name: "Brave Prince",
  archetype: "hero",
  description: "A young brave prince with golden armor.",
  needsParts: true
};

const illustrationRequest: CharacterGenerationRequest = {
  charId: "c_scene_bg",
  name: "Forest Background",
  archetype: "supporting",
  description: "A lush magical Indian forest.",
  needsParts: false
};

// --- Expected use ---
describe("routeCharacterGeneration — expected use", () => {
  it("returns a stub result for puppet-part requests (no Stitch MCP in test env)", async () => {
    const result = await routeCharacterGeneration(heroRequest, { stitchMcpAvailable: false });

    expect(result.assetId).toBeDefined();
    expect(result.name).toBe("Brave Prince");
    expect(result.hasParts).toBe(true);
    expect(result.source).toBe("stitch_stub");
    expect(result.parts).toBeDefined();
    expect(Object.keys(result.parts ?? {})).toContain("head");
  });

  it("returns an SVG placeholder for illustration requests when GCP not configured", async () => {
    const result = await routeCharacterGeneration(illustrationRequest, {});

    expect(result.assetId).toBeDefined();
    expect(result.name).toBe("Forest Background");
    expect(result.hasParts).toBe(false);
    expect(result.source).toBe("svg_placeholder");
  });
});

// --- Edge case ---
describe("routeCharacterGeneration — edge cases", () => {
  it("includes all standard puppet parts in the stub result", async () => {
    const result = await routeCharacterGeneration(heroRequest, {});

    const expectedParts = ["head", "torso", "left_arm", "right_arm", "left_leg", "right_leg"];
    for (const part of expectedParts) {
      expect(result.parts).toHaveProperty(part);
    }
  });

  it("generates different assetIds for different requests", async () => {
    const r1 = await routeCharacterGeneration(heroRequest, {});
    const r2 = await routeCharacterGeneration({ ...heroRequest, charId: "c_hero2" }, {});

    expect(r1.assetId).not.toBe(r2.assetId);
  });
});

// --- Failure case ---
describe("routeCharacterGeneration — failure cases", () => {
  it("falls back to SVG placeholder when Vertex AI throws (no GCP project)", async () => {
    // No GCP configured → should get SVG fallback, not throw.
    const result = await routeCharacterGeneration(illustrationRequest, {
      gcpProject: undefined,
      gcpLocation: undefined
    });

    expect(result.source).toBe("svg_placeholder");
  });
});
