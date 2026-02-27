import { compileNatyaScript } from "../../../../apps/story-runtime/src/natyaCompiler";
import { playStageCommands, type RuntimeStageCommand } from "../../../../apps/story-runtime/src/runtime";
import {
  createStageGatewayClient,
  sendStageCommands,
  startNetworkGateway
} from "../../../stage-gateway/src/networkGateway";
import {
  getSessionArtifactMap,
  type CastSelection
} from "../domain/castingSessionStore";
import { normalizeCastSelections } from "../domain/castSelectionValidation";
import { buildStageDirectorPlan } from "../../../agent-orchestrator/src/workflows/stageDirectorWorkflow";
import { analyzeStory } from "./analyzeStory";
import { resolveCharacters } from "./resolveCharacters";

type RunDemoRequest = {
  storyId: string;
  language: string;
  style: string;
  text: string;
  script: string;
  shadowArtifactId?: string;
  castSelections?: CastSelection[];
};

type RunDemoResponse = {
  storyId: string;
  analyzed: Awaited<ReturnType<typeof analyzeStory>>;
  resolution: Awaited<ReturnType<typeof resolveCharacters>>;
  ack: {
    accepted: number;
    dropped: number;
  };
  replay: RuntimeStageCommand[];
  playbill: ReturnType<Awaited<ReturnType<typeof startNetworkGateway>>["playbill"]>;
  cinema: ReturnType<Awaited<ReturnType<typeof startNetworkGateway>>["cinemaCapture"]>;
  overlay: ReturnType<Awaited<ReturnType<typeof startNetworkGateway>>["overlay"]>;
  runtimeReport: Awaited<ReturnType<typeof playStageCommands>>;
};

type EnvInput = Record<string, string | undefined>;

const canonicalCharacterId = (charId: string): string => {
  const normalized = charId.trim().toLowerCase();

  if (normalized.startsWith("char_")) {
    return normalized.slice("char_".length);
  }

  if (normalized.startsWith("c_")) {
    return normalized.slice("c_".length);
  }

  return normalized;
};

const requireNonEmptyString = (
  value: unknown,
  fieldName: "storyId" | "language" | "style" | "text" | "script"
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid runDemo input: ${fieldName} is required and must be a non-empty string`);
  }

  return value.trim();
};

const selectPrimaryArtifact = (
  resolvedCharacters: Awaited<ReturnType<typeof resolveCharacters>>["resolvedCharacters"],
  selectedArtifactByCharacterId: ReadonlyMap<string, string>,
  fallbackSelections: CastSelection[]
): string => {
  const preferred = resolvedCharacters.find((entry) => entry.charId.toLowerCase().includes("hero"));
  if (preferred) {
    return (
      selectedArtifactByCharacterId.get(canonicalCharacterId(preferred.charId)) ?? preferred.selectedArtifactId
    );
  }

  for (const character of resolvedCharacters) {
    const selectedArtifactId = selectedArtifactByCharacterId.get(canonicalCharacterId(character.charId));
    if (selectedArtifactId) {
      return selectedArtifactId;
    }
  }

  const fallbackSelection = fallbackSelections[0];
  if (fallbackSelection) {
    return fallbackSelection.artifactId;
  }

  const first = resolvedCharacters[0];
  if (!first) {
    throw new Error("Unable to run demo: no resolved characters available");
  }

  return first.selectedArtifactId;
};

const selectRoleArtifacts = (
  analyzedCharacters: Awaited<ReturnType<typeof analyzeStory>>["characters"],
  castSelections: CastSelection[]
): Record<string, string | undefined> => {
  const characterById = new Map(
    analyzedCharacters.map((character) => [canonicalCharacterId(character.charId), character])
  );

  const findBy = (predicate: (selection: CastSelection) => boolean): string | undefined =>
    castSelections.find(predicate)?.artifactId;

  const elderArtifactId = findBy((selection) => {
    const character = characterById.get(canonicalCharacterId(selection.charId));
    if (!character) {
      return false;
    }

    return (
      character.archetype === "mentor" ||
      character.name.toLowerCase().includes("elder") ||
      selection.charId.toLowerCase().includes("elder")
    );
  });

  return {
    elder: elderArtifactId
  };
};

const parseBooleanFlag = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === "true";

export const isAgenticRunEnabled = (env: EnvInput = process.env): boolean =>
  parseBooleanFlag(env.AGENTIC_RUN_ENABLED);

export const runDemo = async (input: RunDemoRequest): Promise<RunDemoResponse> => {
  const storyId = requireNonEmptyString(input?.storyId, "storyId");
  const language = requireNonEmptyString(input?.language, "language");
  const style = requireNonEmptyString(input?.style, "style");
  const text = requireNonEmptyString(input?.text, "text");
  const script = requireNonEmptyString(input?.script, "script");

  const analyzed = await analyzeStory({
    storyId,
    language,
    text
  });

  const resolution = await resolveCharacters({
    storyId,
    style,
    characters: analyzed.characters
  });

  const storedSession = getSessionArtifactMap(storyId);
  const requestSelections = normalizeCastSelections(input?.castSelections, "runDemo");
  const sessionSelections = normalizeCastSelections(storedSession?.castSelections, "runDemo");
  const castSelections = requestSelections.length > 0 ? requestSelections : sessionSelections;
  const selectedArtifactByCharacterId = new Map(
    castSelections.map((selection) => [canonicalCharacterId(selection.charId), selection.artifactId])
  );

  const primaryArtifactId = isAgenticRunEnabled()
    ? buildStageDirectorPlan({
        resolvedCharacters: resolution.resolvedCharacters,
        castSelections
      }).primaryArtifactId
    : selectPrimaryArtifact(resolution.resolvedCharacters, selectedArtifactByCharacterId, castSelections);
  const selectedShadowArtifactId = castSelections.find((selection) =>
    selection.charId.toLowerCase().includes("shadow")
  )?.artifactId;
  const explicitShadowArtifactId =
    typeof input?.shadowArtifactId === "string" ? input.shadowArtifactId.trim() : undefined;
  const shadowArtifactId =
    explicitShadowArtifactId && explicitShadowArtifactId.length > 0
      ? explicitShadowArtifactId
      : selectedShadowArtifactId ?? "shadow_double_v1";
  const roleArtifactIds = selectRoleArtifacts(analyzed.characters, castSelections);

  const stageCommands = compileNatyaScript({
    storyId,
    script,
    resolvedArtifactId: primaryArtifactId,
    shadowArtifactId,
    roleArtifactIds
  });

  const gateway = await startNetworkGateway({
    grpcPort: 0,
    wsPort: 0
  });

  let client: ReturnType<typeof createStageGatewayClient> | undefined;
  try {
    client = createStageGatewayClient(`127.0.0.1:${gateway.grpcPort}`);
    const ack = await sendStageCommands(
      client,
      stageCommands.map((command) => ({
        json: JSON.stringify(command)
      }))
    );

    const replay = gateway.replay(storyId) as RuntimeStageCommand[];
    const cast = Array.from(new Set(replay.map((command) => command.target.artifactId)));
    const runtimeReport = await playStageCommands(replay, cast);

    return {
      storyId,
      analyzed,
      resolution,
      ack,
      replay,
      playbill: gateway.playbill(storyId),
      cinema: gateway.cinemaCapture(storyId),
      overlay: gateway.overlay(),
      runtimeReport
    };
  } finally {
    client?.close();
    await gateway.close();
  }
};
