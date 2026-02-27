import { describe, expect, it } from "vitest";

import {
  buildRunDemoPayload,
  defaultStoryDraft,
  normalizeStoryDraft
} from "../web/storyDraft.js";

describe("story draft", () => {
  it("normalizes whitespace and keeps explicit storyId", () => {
    const normalized = normalizeStoryDraft(
      {
        storyId: "  moon_oath_story_1  ",
        style: " leather-shadow ",
        language: " en ",
        text: "  Asha restores the oath.  ",
        script: "  @0 SCENE_OPEN  "
      },
      {
        nowMs: 1700000000000
      }
    );

    expect(normalized.storyId).toBe("moon_oath_story_1");
    expect(normalized.style).toBe("leather-shadow");
    expect(normalized.language).toBe("en");
    expect(normalized.text).toBe("Asha restores the oath.");
    expect(normalized.script).toBe("@0 SCENE_OPEN");
  });

  it("generates storyId from text when omitted", () => {
    const normalized = normalizeStoryDraft(
      {
        storyId: "   ",
        style: "leather-shadow",
        language: "en",
        text: "Moon oath returns at dawn",
        script: "@0 SCENE_OPEN"
      },
      {
        nowMs: 1700000000123
      }
    );

    expect(normalized.storyId).toBe("moon_oath_returns_at_dawn_loyw3v5n");
  });

  it("uses default draft values when no input is provided", () => {
    const normalized = normalizeStoryDraft(undefined, {
      nowMs: 1700000000000
    });

    expect(normalized).toEqual(defaultStoryDraft);
  });

  it("builds run-demo payload with cast selections", () => {
    const payload = buildRunDemoPayload(defaultStoryDraft, [
      {
        charId: "c_asha",
        artifactId: "asha_gen_v1",
        source: "generated"
      }
    ]);

    expect(payload.storyId).toBe(defaultStoryDraft.storyId);
    expect(payload.script).toBe(defaultStoryDraft.script);
    expect(payload.castSelections).toHaveLength(1);
    expect(payload.castSelections[0]?.artifactId).toBe("asha_gen_v1");
  });
});
