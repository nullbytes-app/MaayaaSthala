import { randomUUID } from "node:crypto";
import { compileNatyaScript } from "../../../../apps/story-runtime/src/natyaCompiler.js";
import {
  buildStoryGenerationPrompt,
  type FolkloreTradition,
  FOLKLORE_TEMPLATES
} from "../prompts.js";
import type { GeneratedStory } from "../types.js";

type StoryGeneratorDeps = {
  runJsonPrompt: (prompt: string) => Promise<unknown>;
};

type StoryGeneratorInput = {
  userRequest: string;
  tradition?: FolkloreTradition;
};

const VALID_TRADITIONS: FolkloreTradition[] = [
  "chandamama",
  "panchatantra",
  "vikram_betaal",
  "tenali_raman",
  "regional"
];

/**
 * Detect the most likely folklore tradition from the user's request.
 *
 * @param request - Raw user request string.
 * @returns Best-matching tradition, or "chandamama" as default.
 */
const detectTradition = (request: string): FolkloreTradition => {
  const lower = request.toLowerCase();

  if (lower.includes("panchatantra") || lower.includes("animal")) {
    return "panchatantra";
  }

  if (lower.includes("vikram") || lower.includes("betaal") || lower.includes("betala")) {
    return "vikram_betaal";
  }

  if (lower.includes("tenali") || lower.includes("raman")) {
    return "tenali_raman";
  }

  if (
    lower.includes("tamil") ||
    lower.includes("bengali") ||
    lower.includes("rajasthani") ||
    lower.includes("regional")
  ) {
    return "regional";
  }

  // Default: Chandamama covers most general Indian folklore requests.
  return "chandamama";
};

const validateRawStory = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Story generator returned a non-object response");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.storyId !== "string" || !obj.storyId) {
    throw new Error("Story generator response missing storyId");
  }

  if (typeof obj.title !== "string" || !obj.title) {
    throw new Error("Story generator response missing title");
  }

  if (!Array.isArray(obj.characters) || obj.characters.length === 0) {
    throw new Error("Story generator response missing characters array");
  }

  if (typeof obj.natyaScript !== "string" || !obj.natyaScript.trim()) {
    throw new Error("Story generator response missing natyaScript");
  }

  return obj;
};

/**
 * Generate a complete story with NatyaScript screenplay using Gemini.
 *
 * Validates that the generated NatyaScript compiles successfully.
 * Re-prompts once on compilation failure.
 *
 * @param input - User request and optional tradition override.
 * @param deps - ModelGateway runJsonPrompt function.
 * @returns A fully validated GeneratedStory with compilable NatyaScript.
 */
export const generateStory = async (
  input: StoryGeneratorInput,
  deps: StoryGeneratorDeps
): Promise<GeneratedStory> => {
  const tradition = input.tradition ?? detectTradition(input.userRequest);
  const storyId = `story_${Date.now()}`;
  const prompt = buildStoryGenerationPrompt(tradition, input.userRequest, storyId);

  const raw: unknown = await deps.runJsonPrompt(prompt).catch((error: unknown) => {
    throw new Error(
      `Story generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });

  const obj = validateRawStory(raw);

  // Validate that the NatyaScript compiles against the actual compiler.
  const natyaScript = (obj.natyaScript as string).trim();
  const dummyArtifactId = "validation_artifact";

  try {
    compileNatyaScript({
      storyId: obj.storyId as string,
      script: natyaScript,
      resolvedArtifactId: dummyArtifactId
    });
  } catch (compileError) {
    const errorMessage = compileError instanceof Error ? compileError.message : String(compileError);

    // Retry once with explicit correction instruction.
    const retryPrompt =
      `${prompt}\n\nIMPORTANT: Your previous NatyaScript had a compilation error: ${errorMessage}\n` +
      `Fix the NatyaScript. Ensure every line is: @<number> <OPCODE> [key=value ...]\n` +
      `Do not use quotes around text values. Return the complete JSON again.`;

    const retryRaw = await deps.runJsonPrompt(retryPrompt);
    const retryObj = validateRawStory(retryRaw);

    // Final validation — if this still fails, let the error propagate.
    compileNatyaScript({
      storyId: retryObj.storyId as string,
      script: (retryObj.natyaScript as string).trim(),
      resolvedArtifactId: dummyArtifactId
    });

    Object.assign(obj, retryObj);
  }

  const characters = (obj.characters as Array<Record<string, unknown>>).map((char) => ({
    charId: typeof char.charId === "string" ? char.charId : `c_${randomUUID().slice(0, 8)}`,
    name: typeof char.name === "string" ? char.name : "Unknown",
    archetype: typeof char.archetype === "string" ? char.archetype : "supporting",
    description: typeof char.description === "string" ? char.description : ""
  }));

  return {
    storyId: obj.storyId as string,
    title: obj.title as string,
    tradition,
    synopsis: typeof obj.synopsis === "string" ? obj.synopsis : "",
    moral: typeof obj.moral === "string" ? obj.moral : undefined,
    characters,
    natyaScript: (obj.natyaScript as string).trim()
  };
};
