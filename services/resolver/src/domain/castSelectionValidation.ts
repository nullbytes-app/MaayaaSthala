import { type CastSelection, type CastingSelectionSource } from "./castingSessionStore";

type NormalizeOptions = {
  requireNonEmpty?: boolean;
};

const requireNonEmptyString = (
  value: unknown,
  fieldName: "charId" | "artifactId",
  context: string
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Invalid ${context} input: ${fieldName} is required and must be a non-empty string`
    );
  }

  return value.trim();
};

const normalizeSource = (value: unknown, index: number, context: string): CastingSelectionSource => {
  if (value !== "existing" && value !== "generated" && value !== "default") {
    throw new Error(
      `Invalid ${context} input: castSelections[${index}].source must be existing, generated, or default`
    );
  }

  return value;
};

export const normalizeCastSelections = (
  value: unknown,
  context: string,
  options: NormalizeOptions = {}
): CastSelection[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${context} input: castSelections must be an array`);
  }

  if (options.requireNonEmpty && value.length === 0) {
    throw new Error(`Invalid ${context} input: castSelections must be a non-empty array`);
  }

  const seenCharacterIds = new Set<string>();
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      throw new Error(`Invalid ${context} input: castSelections[${index}] must be an object`);
    }

    const record = entry as Record<string, unknown>;
    const charId = requireNonEmptyString(record.charId, "charId", context);
    if (seenCharacterIds.has(charId)) {
      throw new Error(`Invalid ${context} input: castSelections contains duplicate charId: ${charId}`);
    }
    seenCharacterIds.add(charId);

    return {
      charId,
      artifactId: requireNonEmptyString(record.artifactId, "artifactId", context),
      source: normalizeSource(record.source, index, context)
    };
  });
};
