import type {
  GeneratedCastingCandidate,
  StitchCharacterInput,
  StitchClient,
  StitchGenerateInput
} from "../../../resolver/src/integrations/stitchClient";

export type ArtifactGenerationWorkflowInput = StitchGenerateInput;

export type ArtifactGenerationWorkflowOutput = {
  storyId: string;
  character: StitchCharacterInput;
  generatedCandidates: GeneratedCastingCandidate[];
};

export const runArtifactGenerationWorkflow = async (
  input: ArtifactGenerationWorkflowInput,
  stitchClient: StitchClient
): Promise<ArtifactGenerationWorkflowOutput> => {
  const generatedCandidates = await stitchClient.generateCharacterParts(input);

  return {
    storyId: input.storyId,
    character: input.character,
    generatedCandidates
  };
};
