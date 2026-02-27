import {
  runStoryAnalyzerWorkflow,
  type StoryAnalyzerWorkflowOutput
} from "../../../agent-orchestrator/src/workflows/storyAnalyzerWorkflow";
import type { ModelGateway } from "../../../agent-orchestrator/src/adk/modelGateway";

export type AnalyzeStoryRequest = {
  storyId: string;
  language: string;
  text: string;
};

export type StoryCharacter = {
  charId: string;
  name: string;
  aliases: string[];
  archetype: string;
};

export type StoryScene = {
  sceneId: string;
  characters: string[];
  summary: string;
};

export type AnalyzeStoryResponse = {
  storyId: string;
  characters: StoryCharacter[];
  scenes: StoryScene[];
};

type EnvInput = Record<string, string | undefined>;

type AnalyzeStoryDeps = {
  env?: EnvInput;
  runStoryWorkflow?: typeof runStoryAnalyzerWorkflow;
  storyGateway?: ModelGateway;
  onWarning?: (warning: AnalyzeStoryWarning) => void;
};

type AnalyzeStoryWarning = {
  storyId: string;
  agenticAnalyzeEnabled: boolean;
  reason: "story_gateway_not_configured" | "story_workflow_failed";
  errorMessage?: string;
};

const STOP_WORDS = new Set(["the", "a", "an", "later", "in", "on", "at", "and"]);

const parseBooleanFlag = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === "true";

export const isAgenticAnalyzeEnabled = (env: EnvInput = process.env): boolean =>
  parseBooleanFlag(env.AGENTIC_ANALYZE_ENABLED);

const ARCHETYPE_BY_NAME: Record<string, string> = {
  // Legacy
  raju: "hero",
  elder: "mentor",
  king: "villain",
  demon: "villain",
  // Heroes and protagonists
  arjun: "hero",
  rama: "hero",
  krishna: "hero",
  meera: "hero",
  priya: "hero",
  vikram: "hero",
  rani: "hero",
  prince: "hero",
  princess: "hero",
  boy: "hero",
  girl: "hero",
  // Mentors and guides
  rishi: "mentor",
  sage: "mentor",
  pandit: "mentor",
  guru: "mentor",
  grandmother: "mentor",
  nani: "mentor",
  dadi: "mentor",
  // Villains and antagonists
  asura: "villain",
  rakshasa: "villain",
  mahishasura: "villain",
  ravana: "villain",
  ravan: "villain",
  durjana: "villain",
  shaitaan: "villain",
  // Tricksters
  jackal: "trickster",
  fox: "trickster",
  tenali: "trickster",
  birbal: "trickster",
  // Celestial / divine
  devi: "guardian",
  lakshmi: "guardian",
  saraswati: "guardian",
  durga: "guardian",
  apsara: "supporting",
  gandharva: "supporting",
  yaksha: "supporting",
  naga: "supporting",
  // Animals
  vanara: "supporting",
  monkey: "supporting",
  elephant: "supporting",
  lion: "supporting",
  tiger: "supporting",
  tortoise: "supporting",
  crow: "supporting",
  // Royalty
  raja: "supporting",
  maharaja: "villain",
  minister: "supporting",
  court: "supporting"
};

const requireNonEmptyString = (value: unknown, fieldName: "storyId" | "language" | "text"): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Invalid analyzeStory input: ${fieldName} is required and must be a non-empty string`
    );
  }

  return value;
};

const toCharId = (name: string): string => `c_${name.toLowerCase().replace(/\s+/g, "_")}`;

const normalizeToken = (value: string): string => value.normalize("NFKC").toLocaleLowerCase();

type SegmenterCtorLike = new (
  locale?: string,
  options?: { granularity: "word" | "sentence" }
) => {
  segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }>;
};

const SEGMENTER_CTOR = (globalThis.Intl as unknown as { Segmenter?: SegmenterCtorLike }).Segmenter;

const isLikelyCjkText = (value: string): boolean =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);

const tokenizeWords = (value: string, language: string): string[] => {
  const wordTokens: string[] = [];

  if (SEGMENTER_CTOR) {
    const segmenter = new SEGMENTER_CTOR(language, { granularity: "word" });
    for (const segment of segmenter.segment(value)) {
      if (segment.isWordLike === false) {
        continue;
      }

      const normalized = normalizeToken(segment.segment);
      if (normalized.length < 2 || STOP_WORDS.has(normalized)) {
        continue;
      }

      wordTokens.push(normalized);
    }

    if (wordTokens.length > 0) {
      return wordTokens;
    }
  }

  const regexTokens = value.match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
  for (const token of regexTokens) {
    if (isLikelyCjkText(token) && token.length > 2) {
      for (let index = 0; index <= token.length - 2; index += 1) {
        const normalized = normalizeToken(token.slice(index, index + 2));
        if (normalized.length >= 2) {
          wordTokens.push(normalized);
        }
      }
      continue;
    }

    const normalized = normalizeToken(token);
    if (normalized.length >= 2) {
      wordTokens.push(normalized);
    }
  }

  return wordTokens.filter((token) => !STOP_WORDS.has(token));
};

const splitSentences = (text: string, language: string): string[] => {
  if (SEGMENTER_CTOR) {
    const segmenter = new SEGMENTER_CTOR(language, { granularity: "sentence" });
    const segments = Array.from(segmenter.segment(text))
      .map((segment) => segment.segment.trim())
      .filter(Boolean);

    if (segments.length > 0) {
      return segments;
    }
  }

  return text
    .split(/[.!?。！？।؟]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

const stripLeadingStopWords = (name: string): string => {
  const tokens = name.split(/\s+/).filter(Boolean);
  let firstNonStopWordIndex = 0;

  while (
    firstNonStopWordIndex < tokens.length &&
    STOP_WORDS.has(tokens[firstNonStopWordIndex].toLowerCase())
  ) {
    firstNonStopWordIndex += 1;
  }

  return tokens.slice(firstNonStopWordIndex).join(" ");
};

const extractNameMatches = (language: string, text: string): string[] => {
  if (language === "en") {
    return text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g) ?? [];
  }

  const tokens = tokenizeWords(text, language);
  const frequencyByToken = new Map<string, number>();

  for (const token of tokens) {
    frequencyByToken.set(token, (frequencyByToken.get(token) ?? 0) + 1);
  }

  const repeatedTokens = Array.from(frequencyByToken.entries())
    .filter(([, count]) => count >= 2)
    .map(([token]) => token);

  if (repeatedTokens.length > 0) {
    return repeatedTokens;
  }

  return Array.from(new Set(tokens)).slice(0, 4);
};

const uniqueByNormalizedValue = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeToken(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(value);
  }

  return result;
};

export const legacyAnalyzeStory = async (input: AnalyzeStoryRequest): Promise<AnalyzeStoryResponse> => {
  const storyId = requireNonEmptyString(input?.storyId, "storyId");
  const language = requireNonEmptyString(input?.language, "language");
  const text = requireNonEmptyString(input?.text, "text");

  const languageCode = language.trim().toLowerCase();
  const sentenceList = splitSentences(text, languageCode);

  const nameMatches = extractNameMatches(languageCode, text)
    .map(stripLeadingStopWords)
    .filter(Boolean);
  const names = uniqueByNormalizedValue(nameMatches);

  const characters = names.map((name) => {
    const normalized = name.toLowerCase();
    const archetypeEntry = Object.entries(ARCHETYPE_BY_NAME).find(([token]) => normalized.includes(token));

    return {
      charId: toCharId(name),
      name,
      aliases: [],
      archetype: archetypeEntry?.[1] ?? "supporting"
    };
  });

  const scenes = sentenceList.map((sentence, index) => {
    const sentenceTokens = new Set(tokenizeWords(sentence, languageCode));
    const sceneCharacters = characters
      .filter((character) => {
        const characterTokens = tokenizeWords(character.name, languageCode);

        if (characterTokens.length === 0) {
          return false;
        }

        return characterTokens.every((token) => sentenceTokens.has(token));
      })
      .map((character) => character.charId);

    return {
      sceneId: `s${index + 1}`,
      characters: sceneCharacters,
      summary: sentence
    };
  });

  return {
    storyId,
    characters,
    scenes
  };
};

const isAnalyzeStoryDeps = (value: AnalyzeStoryDeps | EnvInput): value is AnalyzeStoryDeps =>
  "env" in value || "runStoryWorkflow" in value || "storyGateway" in value || "onWarning" in value;

const normalizeAnalyzeStoryDeps = (
  depsOrEnv: AnalyzeStoryDeps | EnvInput | undefined
): Required<Pick<AnalyzeStoryDeps, "env">> & Omit<AnalyzeStoryDeps, "env"> => {
  if (!depsOrEnv) {
    return {
      env: process.env
    };
  }

  if (isAnalyzeStoryDeps(depsOrEnv)) {
    return {
      env: depsOrEnv.env ?? process.env,
      runStoryWorkflow: depsOrEnv.runStoryWorkflow,
      storyGateway: depsOrEnv.storyGateway,
      onWarning: depsOrEnv.onWarning
    };
  }

  return {
    env: depsOrEnv
  };
};

const sanitizeAnalyzeInput = (input: AnalyzeStoryRequest): AnalyzeStoryRequest => ({
  storyId: requireNonEmptyString(input?.storyId, "storyId"),
  language: requireNonEmptyString(input?.language, "language"),
  text: requireNonEmptyString(input?.text, "text")
});

export const analyzeStory = async (
  input: AnalyzeStoryRequest,
  depsOrEnv?: AnalyzeStoryDeps | EnvInput
): Promise<AnalyzeStoryResponse> => {
  const deps = normalizeAnalyzeStoryDeps(depsOrEnv);
  const normalizedInput = sanitizeAnalyzeInput(input);
  const agenticAnalyzeEnabled = isAgenticAnalyzeEnabled(deps.env);

  if (!agenticAnalyzeEnabled) {
    return legacyAnalyzeStory(normalizedInput);
  }

  if (!deps.storyGateway) {
    deps.onWarning?.({
      storyId: normalizedInput.storyId,
      agenticAnalyzeEnabled,
      reason: "story_gateway_not_configured"
    });
    return legacyAnalyzeStory(normalizedInput);
  }

  const runStoryWorkflow = deps.runStoryWorkflow ?? runStoryAnalyzerWorkflow;

  try {
    const workflowResult: StoryAnalyzerWorkflowOutput = await runStoryWorkflow(
      {
        storyId: normalizedInput.storyId,
        language: normalizedInput.language,
        text: normalizedInput.text
      },
      deps.storyGateway
    );

    return workflowResult;
  } catch (error: unknown) {
    deps.onWarning?.({
      storyId: normalizedInput.storyId,
      agenticAnalyzeEnabled,
      reason: "story_workflow_failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return legacyAnalyzeStory(normalizedInput);
  }
};
