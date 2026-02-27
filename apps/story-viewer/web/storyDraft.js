const defaultScript = [
  "@0 SCENE_OPEN rasa=adbhuta tala=adi",
  "@0 NARRATE storyState=invocation oathDelta=5",
  "@1 BARGE_IN chorusRole=elder intent=warn window=1-2",
  "@2 NARRATE storyState=temptation_peak shadowDouble=true oathDelta=-35 desireDelta=70",
  "@3 NARRATE storyState=restoration oathDelta=20 desireDelta=-30",
  "@4 SCENE_CLOSE nextSceneId=next_scene"
].join("\n");

export const defaultStoryDraft = {
  storyId: "viewer_demo_story_1",
  style: "leather-shadow",
  language: "en",
  text: "Raju met Elder and faced his shadow before returning to his vow.",
  script: defaultScript
};

const requireNonEmptyString = (value, fieldName) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Story field '${fieldName}' is required.`);
  }

  return value.trim();
};

const toStorySeed = (text) => {
  const token = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  return token.length > 0 ? token : "custom_story";
};

const resolveStoryId = (storyId, text, nowMs) => {
  if (typeof storyId === "string" && storyId.trim().length > 0) {
    return storyId.trim();
  }

  return `${toStorySeed(text)}_${nowMs.toString(36)}`;
};

const normalizeDraftInput = (input) =>
  input !== null && typeof input === "object" ? input : {};

export const normalizeStoryDraft = (input, options = {}) => {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const normalizedInput = normalizeDraftInput(input);
  const merged = {
    ...defaultStoryDraft,
    ...normalizedInput
  };

  const style = requireNonEmptyString(merged.style, "style");
  const language = requireNonEmptyString(merged.language, "language").toLowerCase();
  const text = requireNonEmptyString(merged.text, "text");
  const script = requireNonEmptyString(merged.script, "script");
  const storyId = resolveStoryId(merged.storyId, text, nowMs);

  return {
    storyId,
    style,
    language,
    text,
    script
  };
};

export const buildRunDemoPayload = (storyDraft, castSelections) => ({
  ...normalizeStoryDraft(storyDraft),
  castSelections: Array.isArray(castSelections) ? castSelections : []
});
