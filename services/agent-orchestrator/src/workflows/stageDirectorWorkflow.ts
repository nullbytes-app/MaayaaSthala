type StageDirectorResolvedCharacter = {
  charId: string;
  selectedArtifactId: string;
};

type StageDirectorCastSelection = {
  charId: string;
  artifactId: string;
};

export type StageDirectorInput = {
  resolvedCharacters: StageDirectorResolvedCharacter[];
  castSelections: StageDirectorCastSelection[];
};

export type StageDirectorPlan = {
  primaryArtifactId: string;
};

const canonicalCharacterId = (charId: string): string => {
  const normalized = charId.trim().toLowerCase();

  if (normalized.startsWith("char_")) {
    return normalized.slice("char_".length);
  }

  if (normalized.startsWith("c_")) {
    return normalized.slice("c_".length);
  }

  return normalized;
};

export const buildStageDirectorPlan = (input: StageDirectorInput): StageDirectorPlan => {
  const selectedByCharId = new Map(
    input.castSelections.map((entry) => [canonicalCharacterId(entry.charId), entry.artifactId])
  );
  const resolvedCharacters = [...input.resolvedCharacters];

  const hero = resolvedCharacters.find((entry) => entry.charId.toLowerCase().includes("hero"));
  if (hero) {
    return {
      primaryArtifactId:
        selectedByCharId.get(canonicalCharacterId(hero.charId)) ?? hero.selectedArtifactId
    };
  }

  for (const character of resolvedCharacters) {
    const selectedArtifactId = selectedByCharId.get(canonicalCharacterId(character.charId));
    if (selectedArtifactId) {
      return {
        primaryArtifactId: selectedArtifactId
      };
    }
  }

  const fallback = resolvedCharacters[0];
  if (fallback) {
    return {
      primaryArtifactId: fallback.selectedArtifactId
    };
  }

  const firstCastSelection = input.castSelections[0];
  if (firstCastSelection) {
    return {
      primaryArtifactId: firstCastSelection.artifactId
    };
  }

  throw new Error("Unable to build stage plan: no primary artifact");
};
