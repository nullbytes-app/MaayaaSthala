import { describe, it, expect } from "vitest";
import { generateCharacter, buildGenerationRequest } from "../src/tools/characterGenerator.js";

const sampleChar = {
  charId: "c_monkey",
  name: "Clever Monkey",
  archetype: "hero",
  description: "A quick-witted monkey who lives in a tall fruit tree."
};

// --- Expected use ---
describe("generateCharacter — expected use", () => {
  it("returns a CharacterAsset with required fields", async () => {
    const request = buildGenerationRequest(sampleChar);
    const asset = await generateCharacter(request, {});

    expect(asset.assetId).toBeDefined();
    expect(asset.name).toBe("Clever Monkey");
    expect(asset.archetype).toBe("hero");
    expect(asset.previewUrl).toBeDefined();
    expect(["stub", "svg", "vertex_ai", "stitch", "library"]).toContain(asset.source);
  });

  it("buildGenerationRequest sets modern cartoon style", () => {
    const request = buildGenerationRequest(sampleChar);
    expect(request.style).toBe("modern 2D cartoon");
  });
});

// --- Edge case: 6-part propagation ---
describe("generateCharacter — 6-part propagation", () => {
  it("propagates all 6 camelCase parts when stub provides them (needsParts=true)", async () => {
    const request = buildGenerationRequest(sampleChar, true);
    // needsParts=true routes to stub which provides all 6 parts in camelCase.
    const asset = await generateCharacter(request, { stitchMcpAvailable: false });

    // Parts must be defined and contain all 6 keys — not guarded so failure is explicit.
    expect(asset.parts).toBeDefined();
    const partKeys = Object.keys(asset.parts!);
    expect(partKeys).toContain("head");
    expect(partKeys).toContain("torso");
    expect(partKeys).toContain("leftArm");
    expect(partKeys).toContain("rightArm");
    expect(partKeys).toContain("leftLeg");
    expect(partKeys).toContain("rightLeg");
  });

  it("does not include snake_case part keys", async () => {
    const request = buildGenerationRequest(sampleChar, true);
    const asset = await generateCharacter(request, { stitchMcpAvailable: false });

    // Parts must be defined — if missing the pipeline dropped them, which is the bug.
    expect(asset.parts).toBeDefined();
    const partKeys = Object.keys(asset.parts!);
    expect(partKeys).not.toContain("left_arm");
    expect(partKeys).not.toContain("right_arm");
    expect(partKeys).not.toContain("left_leg");
    expect(partKeys).not.toContain("right_leg");
  });
});

// --- Failure case ---
describe("generateCharacter — failure cases", () => {
  it("returns a CharacterAsset even with no provider configured", async () => {
    const request = buildGenerationRequest(sampleChar, false);
    // No GCP, no API key — should fall back to SVG placeholder, not throw.
    const asset = await generateCharacter(request, {});

    expect(asset).toBeDefined();
    expect(asset.name).toBe("Clever Monkey");
  });
});
