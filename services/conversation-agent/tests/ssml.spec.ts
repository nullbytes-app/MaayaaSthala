import { describe, it, expect } from "vitest";
import { buildSSML } from "../src/tools/audioNarrator";

describe("SSML Builder", () => {
  it("wraps text with prosody for whispering", () => {
    const ssml = buildSSML("Be very quiet", "whisper");
    expect(ssml).toContain('<prosody volume="soft" rate="slow">');
    expect(ssml).toContain("Be very quiet");
    expect(ssml).toContain("</speak>");
  });

  it("adds emphasis for shouting", () => {
    const ssml = buildSSML("Watch out!", "shout");
    expect(ssml).toContain('<prosody volume="loud" rate="fast" pitch="+2st">');
  });

  it("returns plain speak wrapper for neutral", () => {
    const ssml = buildSSML("Hello there", "neutral");
    expect(ssml).toContain("<speak>");
    expect(ssml).not.toContain("<prosody");
  });

  it("adds break for dramatic pause markers (...)", () => {
    const ssml = buildSSML("And then... silence", "dramatic");
    expect(ssml).toContain('<break time="400ms"/>');
  });

  it("handles undefined emotion hint gracefully", () => {
    const ssml = buildSSML("Just text");
    expect(ssml).toContain("<speak>");
    expect(ssml).toContain("Just text");
  });
});
