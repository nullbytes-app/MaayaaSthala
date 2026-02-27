import type { StoryCharacter } from "../routes/analyzeStory";

export type Artifact = {
  artifactId: string;
  archetype: string;
  style: string;
  tags: string[];
};

export const ARTIFACT_REGISTRY: Artifact[] = [
  {
    artifactId: "hero_raju_v2",
    archetype: "hero",
    style: "leather-shadow",
    tags: ["raju", "hero", "youth"]
  },
  {
    artifactId: "hero_generic_v1",
    archetype: "hero",
    style: "leather-shadow",
    tags: ["hero", "generic"]
  },
  {
    artifactId: "youth_male_v3",
    archetype: "hero",
    style: "leather-shadow",
    tags: ["youth", "male"]
  },
  {
    artifactId: "elder_mentor_v1",
    archetype: "mentor",
    style: "leather-shadow",
    tags: ["elder", "mentor", "village"]
  }
];

const roundScore = (value: number): number => Math.round(value * 100) / 100;

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

export const scoreCharacterToArtifact = (
  character: StoryCharacter,
  artifact: Artifact,
  requestedStyle: string
): number => {
  let score = 0;
  const nameTokens = new Set(tokenize(character.name));

  if (artifact.archetype === character.archetype) {
    score += 0.6;
  }

  if (artifact.style === requestedStyle) {
    score += 0.2;
  }

  const hasNameTokenMatch = artifact.tags.some((tag) => {
    const tagTokens = tokenize(tag);
    return tagTokens.length > 0 && tagTokens.every((token) => nameTokens.has(token));
  });
  if (hasNameTokenMatch) {
    score += 0.2;
  }

  return roundScore(score);
};
