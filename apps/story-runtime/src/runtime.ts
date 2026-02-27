import goldenPathScene from "./scenes/goldenPath.scene.json";
import {
  applyMythicCue,
  createMythicState,
  type MythicState,
  type StoryState
} from "./mythicEngine";
import { evaluateAudienceBargeIn } from "./audienceEngine";

type SceneCommand = {
  beat: number;
  lane: string;
  opcode: string;
  payload: {
    storyState?: StoryState;
    shadowDouble?: boolean;
    oathDelta?: number;
    desireDelta?: number;
  };
};

export type RuntimeStageCommand = {
  version: "1.0";
  eventId: string;
  sceneId: string;
  beat: number;
  lane: string;
  opcode: string;
  target: {
    artifactId: string;
    partId?: string;
  };
  payload: {
    storyState?: StoryState;
    shadowDouble?: boolean;
    oathDelta?: number;
    desireDelta?: number;
    [key: string]: unknown;
  };
  wallTimeMs?: number;
};

type SceneDefinition = {
  sceneId: string;
  cast: Array<{
    charId: string;
    resolvedArtifactId: string;
  }>;
  commands: SceneCommand[];
};

export type PlaySceneReport = {
  hasTemptationPeak: boolean;
  endsWithRestoration: boolean;
  mythicState: MythicState;
  audience: {
    processed: number;
    accepted: number;
    rejected: number;
    appliedRoles: string[];
  };
};

const SCENES: Record<string, SceneDefinition> = {
  goldenPath: goldenPathScene as SceneDefinition
};

const orderCommandsByBeat = <T extends { beat: number }>(commands: T[]): T[] =>
  commands
    .map((command, index) => ({ command, index }))
    .sort((left, right) => left.command.beat - right.command.beat || left.index - right.index)
    .map((entry) => entry.command);

async function* streamCommands<T extends { beat: number }>(commands: T[]) {
  for (const command of orderCommandsByBeat(commands)) {
    await Promise.resolve();
    yield command;
  }
}

export async function playStageCommands(
  commands: RuntimeStageCommand[],
  resolvedArtifactIds: string[]
): Promise<PlaySceneReport> {
  const allowedArtifacts = new Set(resolvedArtifactIds.filter((id) => id.trim().length > 0));

  for (const command of commands) {
    if (!allowedArtifacts.has(command.target.artifactId)) {
      throw new Error(`Stage command target is not in resolved cast: ${command.target.artifactId}`);
    }
  }

  let mythicState = createMythicState();
  let finalStoryState: StoryState | undefined;
  let audienceProcessed = 0;
  let audienceAccepted = 0;
  let audienceRejected = 0;
  const appliedRoles = new Set<string>();

  for await (const command of streamCommands(commands)) {
    if (command.opcode === "BARGE_IN") {
      audienceProcessed += 1;
      const outcome = evaluateAudienceBargeIn(command.beat, command.payload, mythicState);

      if (outcome.accepted) {
        audienceAccepted += 1;
        if (outcome.role) {
          appliedRoles.add(outcome.role);
        }

        mythicState = applyMythicCue(mythicState, {
          beat: command.beat,
          oathDelta: outcome.oathDelta,
          desireDelta: outcome.desireDelta
        });
      } else {
        audienceRejected += 1;
      }
      continue;
    }

    const state = command.payload.storyState;
    if (!state) {
      continue;
    }

    mythicState = applyMythicCue(mythicState, {
      beat: command.beat,
      storyState: state,
      shadowDouble: command.payload.shadowDouble,
      oathDelta: command.payload.oathDelta,
      desireDelta: command.payload.desireDelta
    });

    finalStoryState = state;
  }

  return {
    hasTemptationPeak: mythicState.temptationTriggered,
    endsWithRestoration: finalStoryState === "restoration",
    mythicState,
    audience: {
      processed: audienceProcessed,
      accepted: audienceAccepted,
      rejected: audienceRejected,
      appliedRoles: Array.from(appliedRoles)
    }
  };
}

export async function playScene(
  sceneName: string,
  sceneRegistry: Record<string, SceneDefinition> = SCENES
): Promise<PlaySceneReport> {
  const scene = sceneRegistry[sceneName];
  if (!scene) {
    throw new Error(`Unknown scene: ${sceneName}`);
  }

  if (!scene.cast.every((member) => member.resolvedArtifactId.trim().length > 0)) {
    throw new Error(`Scene cast is not fully resolved: ${sceneName}`);
  }

  const primaryArtifactId = scene.cast[0].resolvedArtifactId;
  const shadowArtifactId =
    scene.cast.find((member) => member.charId === "shadowDouble")?.resolvedArtifactId ??
    primaryArtifactId;

  const stageCommands: RuntimeStageCommand[] = scene.commands.map((command, index) => ({
    version: "1.0",
    eventId: `local_${scene.sceneId}_${command.beat}_${index}`,
    sceneId: scene.sceneId,
    beat: command.beat,
    lane: command.lane,
    opcode: command.opcode,
    target: {
      artifactId: command.payload.shadowDouble ? shadowArtifactId : primaryArtifactId
    },
    payload: command.payload
  }));

  return playStageCommands(
    stageCommands,
    scene.cast.map((member) => member.resolvedArtifactId)
  );
}
