import { describe, expect, it } from "vitest";
import { validateArtifact, validateStageEvent } from "../validators";

const sampleArtifact = {
  version: "1.0",
  artifactId: "hanuman_v1",
  displayName: "Hanuman",
  style: {
    tradition: "leather-shadow",
    palette: ["#F6C177", "#3B2F2F"]
  },
  parts: [
    {
      partId: "head_01",
      role: "head",
      assetRef: "gs://puppets/hanuman/head.png",
      anchor: { x: 0, y: -40 },
      pivot: { x: 0.5, y: 0.8 },
      zIndex: 30,
      constraints: { rotationDegMin: -25, rotationDegMax: 25 }
    }
  ],
  defaultPose: {},
  capabilities: {
    gestures: ["anjali"],
    supportsShadowDouble: true
  }
};

const sampleEvent = {
  version: "1.0",
  eventId: "evt_1",
  sceneId: "s1",
  beat: 0,
  wallTimeMs: 1730001123,
  lane: "puppet",
  opcode: "GESTURE",
  target: {
    artifactId: "hero_raju_v2",
    partId: "right_hand_01"
  },
  payload: { gesture: "anjali" }
};

describe("schema contracts", () => {
  it("validates a minimal artifact spec and stage command sample", () => {
    expect(validateArtifact(sampleArtifact)).toBe(true);
    expect(validateStageEvent(sampleEvent)).toBe(true);
  });

  it("rejects unknown top-level artifact property", () => {
    const artifactWithUnknown = {
      ...sampleArtifact,
      unexpected: true
    };

    expect(validateArtifact(artifactWithUnknown)).toBe(false);
  });

  it("rejects invalid opcode", () => {
    const eventWithInvalidOpcode = {
      ...sampleEvent,
      opcode: "NOT_A_REAL_OPCODE"
    };

    expect(validateStageEvent(eventWithInvalidOpcode)).toBe(false);
  });

  it("rejects GESTURE event without gesture payload", () => {
    const eventWithoutGesturePayload = {
      ...sampleEvent,
      payload: {}
    };

    expect(validateStageEvent(eventWithoutGesturePayload)).toBe(false);
  });

  it("accepts GESTURE payload with optional intensity", () => {
    const eventWithGestureIntensity = {
      ...sampleEvent,
      payload: {
        gesture: "anjali",
        intensity: 0.7
      }
    };

    expect(validateStageEvent(eventWithGestureIntensity)).toBe(true);
  });

  it("rejects SPEAK event without text payload", () => {
    const speakEventWithoutText = {
      ...sampleEvent,
      lane: "audio",
      opcode: "SPEAK",
      target: {
        artifactId: "hero_raju_v2"
      },
      payload: {
        voiceProfile: "heroic_male_tenor"
      }
    };

    expect(validateStageEvent(speakEventWithoutText)).toBe(false);
  });

  it("accepts SPEAK payload with optional voiceProfile", () => {
    const speakEventWithVoiceProfile = {
      ...sampleEvent,
      lane: "audio",
      opcode: "SPEAK",
      target: {
        artifactId: "hero_raju_v2"
      },
      payload: {
        text: "I must keep my vow.",
        voiceProfile: "heroic_male_tenor"
      }
    };

    expect(validateStageEvent(speakEventWithVoiceProfile)).toBe(true);
  });

  it("rejects SCENE_OPEN event without rasa", () => {
    const sceneOpenWithoutRasa = {
      ...sampleEvent,
      lane: "narration",
      opcode: "SCENE_OPEN",
      target: {
        artifactId: "stage"
      },
      payload: {
        tala: "adi"
      }
    };

    expect(validateStageEvent(sceneOpenWithoutRasa)).toBe(false);
  });

  it("rejects SCENE_OPEN event without tala", () => {
    const sceneOpenWithoutTala = {
      ...sampleEvent,
      lane: "narration",
      opcode: "SCENE_OPEN",
      target: {
        artifactId: "stage"
      },
      payload: {
        rasa: "adbhuta"
      }
    };

    expect(validateStageEvent(sceneOpenWithoutTala)).toBe(false);
  });

  it("rejects opcode/lane mismatch for SPEAK on puppet lane", () => {
    const speakOnWrongLane = {
      ...sampleEvent,
      lane: "puppet",
      opcode: "SPEAK",
      payload: {
        text: "I must keep my vow."
      }
    };

    expect(validateStageEvent(speakOnWrongLane)).toBe(false);
  });

  it("rejects opcode/lane mismatch for GESTURE on audio lane", () => {
    const gestureOnWrongLane = {
      ...sampleEvent,
      lane: "audio",
      opcode: "GESTURE",
      payload: {
        gesture: "anjali"
      }
    };

    expect(validateStageEvent(gestureOnWrongLane)).toBe(false);
  });

  it("rejects duplicate partIds in artifact parts", () => {
    const artifactWithDuplicatePartIds = {
      ...sampleArtifact,
      parts: [
        sampleArtifact.parts[0],
        {
          ...sampleArtifact.parts[0],
          role: "face"
        }
      ]
    };

    expect(validateArtifact(artifactWithDuplicatePartIds)).toBe(false);
  });

  it("rejects defaultPose references to unknown part ids", () => {
    const artifactWithUnknownPosePart = {
      ...sampleArtifact,
      defaultPose: {
        ghost_part: {
          rotationDeg: 10
        }
      }
    };

    expect(validateArtifact(artifactWithUnknownPosePart)).toBe(false);
  });

  it("rejects invalid constraint ranges where min exceeds max", () => {
    const artifactWithInvalidConstraintRange = {
      ...sampleArtifact,
      parts: [
        {
          ...sampleArtifact.parts[0],
          constraints: {
            rotationDegMin: 30,
            rotationDegMax: 10
          }
        }
      ]
    };

    expect(validateArtifact(artifactWithInvalidConstraintRange)).toBe(false);
  });

  it("accepts valid BARGE_IN payload with bounded interrupt window", () => {
    const bargeInEvent = {
      ...sampleEvent,
      lane: "control",
      opcode: "BARGE_IN",
      payload: {
        chorusRole: "elder",
        intent: "warn",
        windowStart: 1,
        windowEnd: 2
      }
    };

    expect(validateStageEvent(bargeInEvent)).toBe(true);
  });

  it("rejects BARGE_IN payload when windowStart is greater than windowEnd", () => {
    const invalidBargeWindowEvent = {
      ...sampleEvent,
      lane: "control",
      opcode: "BARGE_IN",
      payload: {
        chorusRole: "elder",
        intent: "warn",
        windowStart: 3,
        windowEnd: 2
      }
    };

    expect(validateStageEvent(invalidBargeWindowEvent)).toBe(false);
  });

  it("rejects BARGE_IN when lane is not control", () => {
    const invalidLaneBargeIn = {
      ...sampleEvent,
      lane: "narration",
      opcode: "BARGE_IN",
      payload: {
        chorusRole: "elder",
        intent: "warn",
        windowStart: 1,
        windowEnd: 2
      }
    };

    expect(validateStageEvent(invalidLaneBargeIn)).toBe(false);
  });
});
