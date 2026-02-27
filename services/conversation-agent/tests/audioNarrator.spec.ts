import { describe, it, expect } from "vitest";
import { narrateText } from "../src/tools/audioNarrator.js";

// --- Expected use ---
describe("narrateText — expected use", () => {
  it("returns unavailable source when gcpProject is not configured", async () => {
    const result = await narrateText("Long ago in a forest there lived a brave prince.");
    expect(result.source).toBe("unavailable");
    expect(result.text).toBe("Long ago in a forest there lived a brave prince.");
    expect(result.audioUrl).toBe("");
  });

  it("estimates duration based on word count", async () => {
    const shortText = "Hello world."; // 2 words
    const longText = "Long ago in a magical forest there lived a very brave young prince who wanted to find the golden flower."; // ~19 words

    const shortResult = await narrateText(shortText);
    const longResult = await narrateText(longText);

    expect(longResult.durationEstimateMs).toBeGreaterThan(shortResult.durationEstimateMs);
  });

  it("includes beat number in the result when provided", async () => {
    const result = await narrateText("Invocation text.", 3);
    expect(result.beatNumber).toBe(3);
  });
});

// --- Edge case ---
describe("narrateText — edge cases", () => {
  it("handles empty string without throwing", async () => {
    const result = await narrateText("");
    expect(result.source).toBe("unavailable");
    expect(result.durationEstimateMs).toBeGreaterThanOrEqual(0);
  });

  it("handles very long narration text", async () => {
    const longText = "word ".repeat(300).trim();
    const result = await narrateText(longText);
    // 300 words / 140 wpm * 60000ms ≈ 128571ms
    expect(result.durationEstimateMs).toBeGreaterThan(100_000);
  });
});

// --- Failure case ---
describe("narrateText — failure cases", () => {
  it("returns unavailable when gcpProject is provided but TTS module not installed", async () => {
    // In test environment, @google-cloud/text-to-speech is likely not installed.
    // The function should gracefully fall back to unavailable, not throw.
    const result = await narrateText("Test narration text.", 1, {
      gcpProject: "test-project-that-will-fail"
    });

    // Either succeeds (if TTS installed) or falls back gracefully.
    expect(["google_cloud_tts", "unavailable"]).toContain(result.source);
  });
});
