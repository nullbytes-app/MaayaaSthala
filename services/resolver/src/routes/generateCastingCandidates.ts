import {
  createStitchClient,
  type GeneratedCastingCandidate,
  type StitchCharacterInput,
  type StitchClient
} from "../integrations/stitchClient";
import {
  runArtifactGenerationWorkflow,
  type ArtifactGenerationWorkflowOutput
} from "../../../agent-orchestrator/src/workflows/artifactGenerationWorkflow";
import { isAgenticCastingEnabled, type EnvInput } from "./prepareCasting";

type GenerateCastingCandidatesInput = {
  storyId: string;
  style: string;
  character: StitchCharacterInput;
};

type GenerateCastingCandidatesDeps = {
  env?: EnvInput;
  runArtifactWorkflow?: typeof runArtifactGenerationWorkflow;
};

export type GenerateCastingCandidatesResponse = {
  storyId: string;
  character: StitchCharacterInput;
  generatedCandidates: GeneratedCastingCandidate[];
};

const requireNonEmptyString = (
  value: unknown,
  fieldName: "storyId" | "style" | "charId" | "name" | "archetype"
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Invalid generateCastingCandidates input: ${fieldName} is required and must be a non-empty string`
    );
  }

  return value.trim();
};

const normalizeCharacter = (value: unknown): StitchCharacterInput => {
  if (value === null || typeof value !== "object") {
    throw new Error("Invalid generateCastingCandidates input: character is required");
  }

  const record = value as Record<string, unknown>;

  return {
    charId: requireNonEmptyString(record.charId, "charId"),
    name: requireNonEmptyString(record.name, "name"),
    archetype: requireNonEmptyString(record.archetype, "archetype")
  };
};

export const generateCastingCandidates = async (
  input: GenerateCastingCandidatesInput,
  client: StitchClient = createStitchClient(),
  deps: GenerateCastingCandidatesDeps = {}
): Promise<GenerateCastingCandidatesResponse> => {
  const storyId = requireNonEmptyString(input?.storyId, "storyId");
  const style = requireNonEmptyString(input?.style, "style");
  const character = normalizeCharacter(input?.character);

  let output: ArtifactGenerationWorkflowOutput;

  if (isAgenticCastingEnabled(deps.env)) {
    const runArtifactWorkflow = deps.runArtifactWorkflow ?? runArtifactGenerationWorkflow;
    try {
      output = await runArtifactWorkflow(
        {
          storyId,
          style,
          character
        },
        client
      );
    } catch {
      const generatedCandidates = await client.generateCharacterParts({
        storyId,
        style,
        character
      });

      output = {
        storyId,
        character,
        generatedCandidates
      };
    }
  } else {
    const generatedCandidates = await client.generateCharacterParts({
      storyId,
      style,
      character
    });

    output = {
      storyId,
      character,
      generatedCandidates
    };
  }

  return {
    storyId,
    character,
    generatedCandidates: output.generatedCandidates
  };
};
