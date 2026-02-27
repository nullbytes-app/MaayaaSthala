import type { StoryCharacter } from "./analyzeStory";
import { ARTIFACT_REGISTRY, scoreCharacterToArtifact } from "../domain/matchScorer";

type ResolveCharactersInput = {
  storyId: string;
  style: string;
  characters: StoryCharacter[];
};

type ResolvedCharacter = {
  charId: string;
  selectedArtifactId: string;
  confidence: number;
  alternates: string[];
  status: "resolved";
};

type UnresolvedCharacter = {
  charId: string;
  reason: string;
  recommendedAction: "generate_artifact";
};

export type ResolveCharactersResponse = {
  storyId: string;
  resolvedCharacters: ResolvedCharacter[];
  unresolvedCharacters: UnresolvedCharacter[];
};

const requireNonEmptyString = (value: unknown, fieldName: "storyId" | "style"): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Invalid resolveCharacters input: ${fieldName} is required and must be a non-empty string`
    );
  }

  return value;
};

const normalizeCharacters = (value: unknown): StoryCharacter[] => {
  if (!Array.isArray(value)) {
    throw new Error("Invalid resolveCharacters input: characters must be an array");
  }

  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      throw new Error(`Invalid resolveCharacters input: characters[${index}] must be an object`);
    }

    const record = entry as Record<string, unknown>;

    const charId = record.charId;
    const name = record.name;
    const archetype = record.archetype;
    const aliases = record.aliases;

    if (typeof charId !== "string" || charId.trim().length === 0) {
      throw new Error(`Invalid resolveCharacters input: characters[${index}].charId is required`);
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(`Invalid resolveCharacters input: characters[${index}].name is required`);
    }
    if (typeof archetype !== "string" || archetype.trim().length === 0) {
      throw new Error(
        `Invalid resolveCharacters input: characters[${index}].archetype is required`
      );
    }
    let normalizedAliases: string[] = [];
    if (aliases !== undefined) {
      if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== "string")) {
        throw new Error(
          `Invalid resolveCharacters input: characters[${index}].aliases must be an array of strings`
        );
      }
      normalizedAliases = aliases;
    }

    return {
      charId,
      name,
      archetype,
      aliases: normalizedAliases
    } as StoryCharacter;
  });
};

export const resolveCharacters = async (
  input: ResolveCharactersInput
): Promise<ResolveCharactersResponse> => {
  const storyId = requireNonEmptyString(input?.storyId, "storyId");
  const style = requireNonEmptyString(input?.style, "style");
  const characters = normalizeCharacters(input?.characters);

  const styleCompatibleArtifacts = ARTIFACT_REGISTRY.filter((artifact) => artifact.style === style);

  const resolvedCharacters: ResolvedCharacter[] = [];
  const unresolvedCharacters: UnresolvedCharacter[] = [];

  for (const character of characters) {
    const ranked = styleCompatibleArtifacts
      .map((artifact) => ({
        artifactId: artifact.artifactId,
        score: scoreCharacterToArtifact(character, artifact, style)
      }))
      .sort((a, b) => b.score - a.score || a.artifactId.localeCompare(b.artifactId));

    const best = ranked[0];
    if (best && best.score >= 0.6) {
      resolvedCharacters.push({
        charId: character.charId,
        selectedArtifactId: best.artifactId,
        confidence: best.score,
        alternates: ranked.slice(1, 3).map((item) => item.artifactId),
        status: "resolved"
      });
      continue;
    }

    unresolvedCharacters.push({
      charId: character.charId,
      reason:
        styleCompatibleArtifacts.length === 0
          ? "No style-compatible artifact in registry"
          : "No compatible artifact in registry",
      recommendedAction: "generate_artifact"
    });
  }

  return {
    storyId,
    resolvedCharacters,
    unresolvedCharacters
  };
};
