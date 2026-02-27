import { validateStageEvent } from "../../../packages/contracts/validators";

type StageLane = "puppet" | "audio" | "narration" | "control";

type StageOpcode =
  | "SCENE_OPEN"
  | "ARTIFACT_BIND"
  | "PLACE"
  | "GESTURE"
  | "SPEAK"
  | "NARRATE"
  | "LIGHT"
  | "SCORE"
  | "PROP"
  | "FRAME"
  | "BARGE_IN"
  | "SCENE_CLOSE";

type StageTarget = {
  artifactId: string;
  partId?: string;
};

type StageFallback = {
  mode?: "none" | "auto_correct" | "drop";
};

type StageProvenance = {
  source?: string;
  model?: string;
  promptTraceId?: string;
};

export interface StageCommand {
  version: "1.0";
  eventId: string;
  sceneId: string;
  beat: number;
  lane: StageLane;
  opcode: StageOpcode;
  target: StageTarget;
  payload: Record<string, unknown>;
  wallTimeMs?: number;
  fallback?: StageFallback;
  provenance?: StageProvenance;
}

export function isStageCommandV1(value: unknown): value is StageCommand {
  return validateStageEvent(value);
}
