type GenerateArtifactRequest = {
  charId: string;
  prompt: string;
  requiredParts: string[];
  style: string;
};

type GenerateArtifactResponse = {
  jobId: string;
  status: "queued";
};

let jobCounter = 0;

const requireNonEmptyString = (
  value: unknown,
  fieldName: "charId" | "prompt" | "style"
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Invalid generateArtifact input: ${fieldName} is required and must be a non-empty string`
    );
  }

  return value;
};

const requireParts = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.some((part) => typeof part !== "string")) {
    throw new Error(
      "Invalid generateArtifact input: requiredParts must be a non-empty array of strings"
    );
  }

  return value;
};

export const generateArtifact = async (
  input: GenerateArtifactRequest
): Promise<GenerateArtifactResponse> => {
  requireNonEmptyString(input?.charId, "charId");
  requireNonEmptyString(input?.prompt, "prompt");
  requireNonEmptyString(input?.style, "style");
  requireParts(input?.requiredParts);

  jobCounter += 1;

  return {
    jobId: `gen_${String(jobCounter).padStart(4, "0")}`,
    status: "queued"
  };
};
