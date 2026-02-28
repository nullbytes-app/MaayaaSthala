import { describe, it, expect } from "vitest";
import { resolveVoiceConfig, DEFAULT_VOICE_PALETTE } from "../src/tools/audioNarrator";

describe("Voice Casting", () => {
  const casting = {
    narrator: { voice: "en-IN-Neural2-A", rate: 0.85, pitch: -1.0 },
    Meera: { voice: "en-IN-Neural2-B", rate: 1.0, pitch: 1.5 },
    Raja: { voice: "en-IN-Neural2-D", rate: 1.1, pitch: 0.0 }
  };

  it("resolves known character voice from casting", () => {
    const config = resolveVoiceConfig("Meera", casting);
    expect(config.voiceName).toBe("en-IN-Neural2-B");
    expect(config.speakingRate).toBe(1.0);
    expect(config.pitch).toBe(1.5);
  });

  it("falls back to default character voice for unknown characters", () => {
    const config = resolveVoiceConfig("UnknownChar", casting);
    expect(config.voiceName).toBe("en-IN-Neural2-D"); // default character voice
  });

  it("returns narrator voice for narrator role", () => {
    const config = resolveVoiceConfig("narrator", casting);
    expect(config.voiceName).toBe("en-IN-Neural2-A");
    expect(config.speakingRate).toBe(0.85);
  });

  it("works with empty casting (backwards compatible)", () => {
    const config = resolveVoiceConfig("AnyChar", {});
    expect(config.voiceName).toBeDefined();
    expect(config.speakingRate).toBeGreaterThan(0);
  });
});
