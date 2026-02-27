import type { RuntimeStageCommand } from "./runtime";

type ResolvedCharacter = {
  charId: string;
  selectedArtifactId: string;
  confidence: number;
};

type PlanInput = {
  storyId: string;
  resolvedCharacters: ResolvedCharacter[];
};

const getPrimaryArtifact = (resolvedCharacters: ResolvedCharacter[]): string => {
  const heroLike = resolvedCharacters.find((entry) => entry.charId.toLowerCase().includes("hero"));
  if (heroLike) {
    return heroLike.selectedArtifactId;
  }

  const first = resolvedCharacters[0];
  if (!first) {
    throw new Error("Cannot plan stage commands without resolved characters");
  }

  return first.selectedArtifactId;
};

export const planGoldenPathStageCommands = (input: PlanInput): RuntimeStageCommand[] => {
  const primaryArtifactId = getPrimaryArtifact(input.resolvedCharacters);

  return [
    {
      version: "1.0",
      eventId: `${input.storyId}_evt_open`,
      sceneId: input.storyId,
      beat: 0,
      lane: "control",
      opcode: "SCENE_OPEN",
      target: {
        artifactId: primaryArtifactId
      },
      payload: {
        rasa: "adbhuta",
        tala: "adi"
      }
    },
    {
      version: "1.0",
      eventId: `${input.storyId}_evt_invocation`,
      sceneId: input.storyId,
      beat: 0,
      lane: "narration",
      opcode: "NARRATE",
      target: {
        artifactId: primaryArtifactId
      },
      payload: {
        storyState: "invocation",
        oathDelta: 5
      }
    },
    {
      version: "1.0",
      eventId: `${input.storyId}_evt_peak`,
      sceneId: input.storyId,
      beat: 1,
      lane: "narration",
      opcode: "NARRATE",
      target: {
        artifactId: primaryArtifactId
      },
      payload: {
        storyState: "temptation_peak",
        shadowDouble: true,
        oathDelta: -35,
        desireDelta: 70
      }
    },
    {
      version: "1.0",
      eventId: `${input.storyId}_evt_restore`,
      sceneId: input.storyId,
      beat: 2,
      lane: "narration",
      opcode: "NARRATE",
      target: {
        artifactId: primaryArtifactId
      },
      payload: {
        storyState: "restoration",
        oathDelta: 20,
        desireDelta: -30
      }
    },
    {
      version: "1.0",
      eventId: `${input.storyId}_evt_close`,
      sceneId: input.storyId,
      beat: 3,
      lane: "control",
      opcode: "SCENE_CLOSE",
      target: {
        artifactId: primaryArtifactId
      },
      payload: {
        nextSceneId: `${input.storyId}_next`
      }
    }
  ];
};
