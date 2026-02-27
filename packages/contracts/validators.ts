import Ajv2020 from "ajv/dist/2020.js";
import artifactSchema from "./artifact-spec.v1.schema.json";
import stageCommandSchema from "./stage-command.v1.schema.json";

const ajv = new Ajv2020();

const validateArtifactImpl = ajv.compile(artifactSchema);
const validateStageEventImpl = ajv.compile(stageCommandSchema);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const getNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const hasUniquePartIds = (value: unknown): boolean => {
  if (!isRecord(value) || !Array.isArray(value.parts)) {
    return false;
  }

  const partIds = new Set<string>();
  for (const part of value.parts) {
    if (!isRecord(part) || typeof part.partId !== "string") {
      return false;
    }

    if (partIds.has(part.partId)) {
      return false;
    }
    partIds.add(part.partId);
  }

  return true;
};

const hasValidDefaultPoseReferences = (value: unknown): boolean => {
  if (!isRecord(value) || !Array.isArray(value.parts) || !isRecord(value.defaultPose)) {
    return false;
  }

  const knownPartIds = new Set<string>();
  for (const part of value.parts) {
    if (!isRecord(part) || typeof part.partId !== "string") {
      return false;
    }
    knownPartIds.add(part.partId);
  }

  return Object.keys(value.defaultPose).every((partId) => knownPartIds.has(partId));
};

const hasValidConstraintRanges = (value: unknown): boolean => {
  if (!isRecord(value) || !Array.isArray(value.parts)) {
    return false;
  }

  for (const part of value.parts) {
    if (!isRecord(part) || !isRecord(part.constraints)) {
      return false;
    }

    const rotationDegMin = getNumber(part.constraints.rotationDegMin);
    const rotationDegMax = getNumber(part.constraints.rotationDegMax);
    const scaleMin = getNumber(part.constraints.scaleMin);
    const scaleMax = getNumber(part.constraints.scaleMax);

    if (rotationDegMin === undefined || rotationDegMax === undefined) {
      return false;
    }

    if (rotationDegMin > rotationDegMax) {
      return false;
    }

    if (scaleMin !== undefined && scaleMax !== undefined && scaleMin > scaleMax) {
      return false;
    }
  }

  return true;
};

const hasValidBargeInWindow = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  if (value.opcode !== "BARGE_IN") {
    return true;
  }

  if (!isRecord(value.payload)) {
    return false;
  }

  const windowStart = getNumber(value.payload.windowStart);
  const windowEnd = getNumber(value.payload.windowEnd);

  if (windowStart === undefined || windowEnd === undefined) {
    return false;
  }

  return windowStart <= windowEnd;
};

export function validateArtifact(value: unknown): boolean {
  if (!(validateArtifactImpl(value) as boolean)) {
    return false;
  }

  return (
    hasUniquePartIds(value) &&
    hasValidDefaultPoseReferences(value) &&
    hasValidConstraintRanges(value)
  );
}

export function validateStageEvent(value: unknown): boolean {
  if (!(validateStageEventImpl(value) as boolean)) {
    return false;
  }

  return hasValidBargeInWindow(value);
}
