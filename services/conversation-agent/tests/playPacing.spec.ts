import { describe, it, expect } from "vitest";
import { calculateBeatDelay } from "../src/tools/playCompiler.js";

/**
 * Tests for opcode-aware beat delay calculation.
 * Verifies correct timing per NatyaScript opcode.
 */

// --- Expected use ---
describe("calculateBeatDelay — expected use", () => {
  it("returns 3000ms for SCENE_OPEN", () => {
    expect(calculateBeatDelay("SCENE_OPEN")).toBe(3000);
  });

  it("returns 2000ms for SCENE_CLOSE", () => {
    expect(calculateBeatDelay("SCENE_CLOSE")).toBe(2000);
  });

  it("returns 1500ms for GESTURE", () => {
    expect(calculateBeatDelay("GESTURE")).toBe(1500);
  });

  it("returns 1200ms for MOVE", () => {
    expect(calculateBeatDelay("MOVE")).toBe(1200);
  });

  it("returns 1200ms for ENTER", () => {
    expect(calculateBeatDelay("ENTER")).toBe(1200);
  });

  it("returns 1200ms for EXIT", () => {
    expect(calculateBeatDelay("EXIT")).toBe(1200);
  });

  it("returns 2000ms for PAUSE", () => {
    expect(calculateBeatDelay("PAUSE")).toBe(2000);
  });

  it("returns 800ms default for unknown opcodes", () => {
    expect(calculateBeatDelay("BARGE_IN")).toBe(800);
    expect(calculateBeatDelay("NARRATE_AMBIENT")).toBe(800);
  });
});

// --- Text-based timing ---
describe("calculateBeatDelay — text-based timing for NARRATE/SPEAK", () => {
  it("uses word-count estimate for NARRATE with text", () => {
    // 10 words at 150wpm = ~4s, but we cap at 8s
    const tenWordText = "the quick brown fox jumps over the lazy sleeping dog";
    const delay = calculateBeatDelay("NARRATE", tenWordText);
    expect(delay).toBeGreaterThanOrEqual(1200);
    expect(delay).toBeLessThanOrEqual(8000);
  });

  it("returns minimum 1200ms for NARRATE with very short text", () => {
    const delay = calculateBeatDelay("NARRATE", "Hi");
    expect(delay).toBe(1200);
  });

  it("returns minimum 1200ms for NARRATE with no text", () => {
    const delay = calculateBeatDelay("NARRATE");
    expect(delay).toBe(1200);
  });

  it("caps at 8000ms for very long text", () => {
    const longText = "word ".repeat(200); // ~200 words
    const delay = calculateBeatDelay("NARRATE", longText);
    expect(delay).toBe(8000);
  });

  it("uses word-count estimate for SPEAK with text", () => {
    const delay = calculateBeatDelay("SPEAK", "I will succeed!");
    expect(delay).toBeGreaterThanOrEqual(1200);
    expect(delay).toBeLessThanOrEqual(8000);
  });
});

// --- Audio duration override ---
describe("calculateBeatDelay — audio duration override", () => {
  it("uses audio duration when provided and positive", () => {
    const audioDuration = 3500;
    // Even for SCENE_OPEN (3000ms default), audio override takes precedence.
    expect(calculateBeatDelay("SCENE_OPEN", undefined, audioDuration)).toBe(3500);
  });

  it("uses audio duration over text-based estimate", () => {
    const text = "A short sentence";
    const audioDuration = 2800;
    expect(calculateBeatDelay("NARRATE", text, audioDuration)).toBe(2800);
  });

  it("ignores zero audio duration (falls back to opcode default)", () => {
    expect(calculateBeatDelay("GESTURE", undefined, 0)).toBe(1500);
  });

  it("ignores undefined audio duration (falls back to opcode default)", () => {
    expect(calculateBeatDelay("SCENE_OPEN", undefined, undefined)).toBe(3000);
  });
});

// --- Edge cases ---
describe("calculateBeatDelay — edge cases", () => {
  it("handles empty string text", () => {
    const delay = calculateBeatDelay("NARRATE", "");
    expect(delay).toBe(1200); // Empty text = minimum
  });

  it("handles whitespace-only text", () => {
    const delay = calculateBeatDelay("SPEAK", "   ");
    expect(delay).toBe(1200);
  });
});
