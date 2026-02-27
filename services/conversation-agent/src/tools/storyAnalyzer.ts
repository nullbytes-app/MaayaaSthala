import type { AnalyzeStoryRequest, AnalyzeStoryResponse } from "../../../../services/resolver/src/routes/analyzeStory.js";

type AnalyzerDeps = {
  /** Base URL of the resolver HTTP server. */
  resolverBaseUrl?: string;
  /** Direct function injection (for tests / in-process usage). */
  analyzeStoryfn?: (input: AnalyzeStoryRequest) => Promise<AnalyzeStoryResponse>;
};

/**
 * Analyze an existing story text to extract characters and scenes.
 *
 * Wraps the existing /v1/stories/analyze endpoint via HTTP,
 * or calls the function directly when running in-process.
 *
 * @param input - Story ID, language code, and story text.
 * @param deps - Optional resolver URL or direct function injection.
 * @returns Characters and scenes extracted from the story.
 */
export const analyzeExistingStory = async (
  input: AnalyzeStoryRequest,
  deps: AnalyzerDeps = {}
): Promise<AnalyzeStoryResponse> => {
  // Direct function injection (used in tests and in-process mode).
  if (deps.analyzeStoryfn) {
    return deps.analyzeStoryfn(input);
  }

  const baseUrl = deps.resolverBaseUrl ?? "http://localhost:3000";
  const response = await fetch(`${baseUrl}/v1/stories/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Story analysis failed (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<AnalyzeStoryResponse>;
};
