const lanePriority = {
  control: 0,
  narration: 1,
  puppet: 2,
  audio: 3
};

const getLanePriority = (lane) => lanePriority[lane] ?? 99;

export const buildReplayFrames = (commands) => {
  if (!Array.isArray(commands)) {
    return [];
  }

  return [...commands]
    .sort((left, right) => {
      if (left.beat !== right.beat) {
        return left.beat - right.beat;
      }

      const laneCompare = getLanePriority(left.lane) - getLanePriority(right.lane);
      if (laneCompare !== 0) {
        return laneCompare;
      }

      return (left.eventId ?? "").localeCompare(right.eventId ?? "");
    })
    .map((command, index) => ({
      index,
      beat: command.beat,
      label: `${command.opcode} @ beat ${command.beat}`,
      command
    }));
};
