import { z } from "zod";

import type { ModelGateway } from "../adk/modelGateway";

type CastingCharacter = {
  charId: string;
  name: string;
  aliases: string[];
  archetype: string;
};

type CastingArtifact = {
  artifactId: string;
  archetype: string;
  style: string;
  tags: string[];
};

export type CastingResolverWorkflowInput = {
  storyId: string;
  style: string;
  language: string;
  text: string;
  characters: CastingCharacter[];
  availableArtifacts: CastingArtifact[];
};

const castingResolverResponseSchema = z.object({
  byCharId: z.record(z.array(z.string())),
  unresolvedCharIds: z.array(z.string()),
  reasoning: z.record(z.string())
});

export type CastingResolverWorkflowOutput = z.infer<typeof castingResolverResponseSchema>;

const buildCastingResolverPrompt = (input: CastingResolverWorkflowInput): string => {
  const charactersJson = JSON.stringify(input.characters);
  const artifactsJson = JSON.stringify(input.availableArtifacts);

  return [
    "Resolve character to artifact ranking and return strict JSON.",
    "The output shape must be:",
    '{"byCharId":{"charId":["artifactId"]},"unresolvedCharIds":["charId"],"reasoning":{"charId":"why"}}',
    "Rank only artifact IDs from the supplied availableArtifacts list.",
    `storyId: ${input.storyId}`,
    `style: ${input.style}`,
    `language: ${input.language}`,
    "characters:",
    charactersJson,
    "availableArtifacts:",
    artifactsJson,
    "storyText:",
    input.text
  ].join("\n");
};

export const runCastingResolverWorkflow = async (
  input: CastingResolverWorkflowInput,
  gateway: ModelGateway
): Promise<CastingResolverWorkflowOutput> => {
  const prompt = buildCastingResolverPrompt(input);
  const rawResponse = await gateway.runJsonPrompt(prompt);

  try {
    return castingResolverResponseSchema.parse(rawResponse);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "Unknown schema validation failure";
    throw new Error(`Invalid casting resolver response: ${detail}`);
  }
};
