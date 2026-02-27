export type CastingSelectionSource = "existing" | "generated" | "default";

export type CastSelection = {
  charId: string;
  artifactId: string;
  source: CastingSelectionSource;
};

export type SessionArtifactMap = {
  storyId: string;
  castSelections: CastSelection[];
  approvedAt: string;
};

const sessionByStoryId = new Map<string, SessionArtifactMap>();

const cloneSelections = (selections: CastSelection[]): CastSelection[] =>
  selections.map((selection) => ({ ...selection }));

const cloneSessionArtifactMap = (map: SessionArtifactMap): SessionArtifactMap => ({
  storyId: map.storyId,
  approvedAt: map.approvedAt,
  castSelections: cloneSelections(map.castSelections)
});

export const saveSessionArtifactMap = (map: SessionArtifactMap): SessionArtifactMap => {
  const stored = cloneSessionArtifactMap(map);
  sessionByStoryId.set(stored.storyId, stored);
  return cloneSessionArtifactMap(stored);
};

export const getSessionArtifactMap = (storyId: string): SessionArtifactMap | undefined =>
  (() => {
    const stored = sessionByStoryId.get(storyId);
    return stored ? cloneSessionArtifactMap(stored) : undefined;
  })();

export const clearSessionArtifactMaps = (): void => {
  sessionByStoryId.clear();
};
