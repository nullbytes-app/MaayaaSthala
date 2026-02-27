export type StoryState = "invocation" | "temptation_peak" | "restoration";

export type MythicCue = {
  beat: number;
  storyState?: StoryState;
  shadowDouble?: boolean;
  oathDelta?: number;
  desireDelta?: number;
};

export type MythicState = {
  invocationSeen: boolean;
  oathIntegrity: number;
  desireLevel: number;
  temptationTriggered: boolean;
  shadowDoubleActive: boolean;
  temptationBeats: number[];
};

const DESIRE_THRESHOLD = 60;
const OATH_THRESHOLD = 50;

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export const createMythicState = (): MythicState => ({
  invocationSeen: false,
  oathIntegrity: 70,
  desireLevel: 20,
  temptationTriggered: false,
  shadowDoubleActive: false,
  temptationBeats: []
});

export const applyMythicCue = (previous: MythicState, cue: MythicCue): MythicState => {
  const next: MythicState = {
    ...previous,
    oathIntegrity: clamp(previous.oathIntegrity + (cue.oathDelta ?? 0)),
    desireLevel: clamp(previous.desireLevel + (cue.desireDelta ?? 0)),
    temptationBeats: [...previous.temptationBeats]
  };

  if (cue.storyState === "invocation") {
    next.invocationSeen = true;
  }

  if (
    cue.storyState === "temptation_peak" &&
    cue.shadowDouble === true &&
    next.invocationSeen &&
    next.desireLevel >= DESIRE_THRESHOLD &&
    next.oathIntegrity <= OATH_THRESHOLD
  ) {
    next.shadowDoubleActive = true;
    next.temptationTriggered = true;
    if (!next.temptationBeats.includes(cue.beat)) {
      next.temptationBeats.push(cue.beat);
    }
  }

  if (cue.storyState === "restoration") {
    next.shadowDoubleActive = false;
    next.desireLevel = Math.min(next.desireLevel, 40);
    next.oathIntegrity = Math.max(next.oathIntegrity, 60);
  }

  return next;
};
