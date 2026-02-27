import {
  saveSessionArtifactMap,
  type SessionArtifactMap
} from "../domain/castingSessionStore";
import { normalizeCastSelections } from "../domain/castSelectionValidation";

type ApproveCastingInput = {
  storyId: string;
  castSelections: unknown;
};

export type ApproveCastingResponse = {
  storyId: string;
  sessionArtifactMap: SessionArtifactMap;
};

const requireNonEmptyString = (
  value: unknown,
  fieldName: "storyId" | "charId" | "artifactId"
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid approveCasting input: ${fieldName} is required and must be a non-empty string`);
  }

  return value.trim();
};

export const approveCasting = async (input: ApproveCastingInput): Promise<ApproveCastingResponse> => {
  const storyId = requireNonEmptyString(input?.storyId, "storyId");
  const castSelections = normalizeCastSelections(input?.castSelections, "approveCasting", {
    requireNonEmpty: true
  });

  const sessionArtifactMap = saveSessionArtifactMap({
    storyId,
    castSelections,
    approvedAt: new Date().toISOString()
  });

  return {
    storyId,
    sessionArtifactMap
  };
};
