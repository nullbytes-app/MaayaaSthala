import { z } from "zod";

import type { ModelGateway } from "../adk/modelGateway";

export type StoryAnalyzerWorkflowInput = {
  storyId: string;
  language: string;
  text: string;
};

const storyAnalyzerResponseSchema = z.object({
  storyId: z.string(),
  characters: z.array(
    z.object({
      charId: z.string(),
      name: z.string(),
      aliases: z.array(z.string()),
      archetype: z.string()
    })
  ),
  scenes: z.array(
    z.object({
      sceneId: z.string(),
      characters: z.array(z.string()),
      summary: z.string()
    })
  )
});

export type StoryAnalyzerWorkflowOutput = z.infer<typeof storyAnalyzerResponseSchema>;

const buildStoryAnalyzerPrompt = (input: StoryAnalyzerWorkflowInput): string => {
  return [
    "Analyze the following story and return strict JSON.",
    "The output shape must be:",
    '{"storyId":"string","characters":[{"charId":"string","name":"string","aliases":["string"],"archetype":"string"}],"scenes":[{"sceneId":"string","characters":["string"],"summary":"string"}]}',
    "Use the same storyId that is provided below.",
    `storyId: ${input.storyId}`,
    `language: ${input.language}`,
    "text:",
    input.text
  ].join("\n");
};

export const runStoryAnalyzerWorkflow = async (
  input: StoryAnalyzerWorkflowInput,
  gateway: ModelGateway
): Promise<StoryAnalyzerWorkflowOutput> => {
  const prompt = buildStoryAnalyzerPrompt(input);
  const rawResponse = await gateway.runJsonPrompt(prompt);

  try {
    return storyAnalyzerResponseSchema.parse(rawResponse);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "Unknown schema validation failure";
    throw new Error(`Invalid story analyzer response: ${detail}`);
  }
};
