import { analyzeStory, type StoryCharacter, type StoryScene } from "./analyzeStory";
import { ARTIFACT_REGISTRY, scoreCharacterToArtifact } from "../domain/matchScorer";
import {
  runCastingResolverWorkflow,
  type CastingResolverWorkflowOutput
} from "../../../agent-orchestrator/src/workflows/castingResolverWorkflow";
import type { ModelGateway } from "../../../agent-orchestrator/src/adk/modelGateway";

type PrepareCastingInput = {
  storyId: string;
  style: string;
  text: string;
  language?: string;
};

export type EnvInput = Record<string, string | undefined>;

type ExistingCandidate = {
  artifactId: string;
  confidence: number;
  source: "existing";
};

type CastingCharacter = StoryCharacter & {
  existingCandidates: ExistingCandidate[];
};

export type PrepareCastingResponse = {
  storyId: string;
  language: string;
  characters: CastingCharacter[];
  scenes: StoryScene[];
};

type PrepareCastingDeps = {
  env?: EnvInput;
  runStoryWorkflow?: (
    input: { storyId: string; language: string; text: string },
    storyGateway: ModelGateway
  ) => Promise<{ storyId: string; characters: StoryCharacter[]; scenes: StoryScene[] }>;
  storyGateway?: ModelGateway;
  runCastingWorkflow?: typeof runCastingResolverWorkflow;
  castingGateway?: ModelGateway;
  onWarning?: (warning: PrepareCastingWarning) => void;
};

type PrepareCastingWarning = {
  storyId: string;
  agenticCastingEnabled: boolean;
  reason: "casting_gateway_not_configured" | "casting_workflow_failed";
  errorMessage?: string;
};

const parseBooleanFlag = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === "true";

export const isAgenticCastingEnabled = (env: EnvInput = process.env): boolean =>
  parseBooleanFlag(env.AGENTIC_CASTING_ENABLED);

const rankCandidatesFromWorkflow = (
  candidates: ExistingCandidate[],
  charId: string,
  workflow: CastingResolverWorkflowOutput
): ExistingCandidate[] => {
  if (workflow.unresolvedCharIds.includes(charId)) {
    return candidates;
  }

  const rankedArtifactIds = workflow.byCharId[charId] ?? [];
  if (rankedArtifactIds.length === 0) {
    return candidates;
  }

  const candidateByArtifactId = new Map(
    candidates.map((candidate) => [candidate.artifactId, candidate] as const)
  );
  const seen = new Set<string>();

  const ranked = rankedArtifactIds
    .map((artifactId) => {
      if (seen.has(artifactId)) {
        return undefined;
      }
      seen.add(artifactId);
      return candidateByArtifactId.get(artifactId);
    })
    .filter((candidate): candidate is ExistingCandidate => candidate !== undefined);

  const remaining = candidates.filter((candidate) => !seen.has(candidate.artifactId));
  return [...ranked, ...remaining];
};

const requireNonEmptyString = (value: unknown, fieldName: "storyId" | "style" | "text"): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Invalid prepareCasting input: ${fieldName} is required and must be a non-empty string`
    );
  }

  return value.trim();
};

const normalizeLanguage = (value: unknown): string => {
  if (value === undefined) {
    return "en";
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Invalid prepareCasting input: language must be a non-empty string when provided");
  }

  return value.trim();
};

export const prepareCasting = async (
  input: PrepareCastingInput,
  deps: PrepareCastingDeps = {}
): Promise<PrepareCastingResponse> => {
  const storyId = requireNonEmptyString(input?.storyId, "storyId");
  const style = requireNonEmptyString(input?.style, "style");
  const text = requireNonEmptyString(input?.text, "text");
  const language = normalizeLanguage(input?.language);

  const analyzed = await analyzeStory({
    storyId,
    language,
    text
  }, {
    env: deps.env,
    storyGateway: deps.storyGateway,
    runStoryWorkflow: deps.runStoryWorkflow
  });

  const styleCompatibleArtifacts = ARTIFACT_REGISTRY.filter((artifact) => artifact.style === style);
  const baseCandidatesByCharId = new Map(
    analyzed.characters.map((character) => {
      const existingCandidates = styleCompatibleArtifacts
        .map((artifact) => ({
          artifactId: artifact.artifactId,
          confidence: scoreCharacterToArtifact(character, artifact, style),
          source: "existing" as const
        }))
        .sort(
          (left, right) => right.confidence - left.confidence || left.artifactId.localeCompare(right.artifactId)
        );

      return [character.charId, existingCandidates] as const;
    })
  );

  let workflowRanking: CastingResolverWorkflowOutput | undefined;
  const agenticCastingEnabled = isAgenticCastingEnabled(deps.env);
  const emitWarning = (warning: PrepareCastingWarning): void => {
    deps.onWarning?.(warning);
  };

  if (agenticCastingEnabled) {
    if (!deps.castingGateway) {
      emitWarning({
        storyId,
        agenticCastingEnabled,
        reason: "casting_gateway_not_configured"
      });
    } else {
      const runCastingWorkflow = deps.runCastingWorkflow ?? runCastingResolverWorkflow;

      try {
        workflowRanking = await runCastingWorkflow(
          {
            storyId,
            style,
            language,
            text,
            characters: analyzed.characters,
            availableArtifacts: styleCompatibleArtifacts
          },
          deps.castingGateway
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        emitWarning({
          storyId,
          agenticCastingEnabled,
          reason: "casting_workflow_failed",
          errorMessage
        });
        workflowRanking = undefined;
      }
    }
  }

  const characters = analyzed.characters.map((character) => {
    const baseCandidates = baseCandidatesByCharId.get(character.charId) ?? [];
    const existingCandidates = workflowRanking
      ? rankCandidatesFromWorkflow(baseCandidates, character.charId, workflowRanking)
      : baseCandidates;

    return {
      ...character,
      existingCandidates
    };
  });

  return {
    storyId,
    language,
    characters,
    scenes: analyzed.scenes
  };
};
