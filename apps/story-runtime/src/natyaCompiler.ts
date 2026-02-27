import type { RuntimeStageCommand } from "./runtime";

type CompileInput = {
  storyId: string;
  script: string;
  resolvedArtifactId: string;
  shadowArtifactId?: string;
  roleArtifactIds?: Record<string, string | undefined>;
};

const parseTokenValue = (value: string): unknown => {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && value.trim() !== "") {
    return asNumber;
  }

  return value;
};

const parsePayload = (tokens: string[]): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  for (const token of tokens) {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = token.slice(0, separatorIndex);
    const rawValue = token.slice(separatorIndex + 1);

    if (key === "window") {
      const [start, end] = rawValue.split("-").map((part) => Number(part));
      payload.windowStart = start;
      payload.windowEnd = end;
      continue;
    }

    payload[key] = parseTokenValue(rawValue);
  }

  return payload;
};

const normalizePayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key === "shadowDouble") {
      normalized.shadowDouble = value;
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
};

const laneByOpcode: Record<string, RuntimeStageCommand["lane"]> = {
  SCENE_OPEN: "control",
  SCENE_CLOSE: "control",
  NARRATE: "narration",
  SPEAK: "audio",
  GESTURE: "puppet",
  BARGE_IN: "control"
};

export const compileNatyaScript = (input: CompileInput): RuntimeStageCommand[] => {
  const lines = input.script
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return lines.map((line, index) => {
    const parts = line.split(/\s+/);
    const beatToken = parts[0];
    const opcode = parts[1];

    const beatMatch = beatToken.match(/^@(\d+)$/);
    if (!beatMatch || !opcode) {
      throw new Error(`Invalid NatyaScript line: ${line}`);
    }

    const beat = Number(beatMatch[1]);
    const payload = normalizePayload(parsePayload(parts.slice(2)));
    const usesShadow = payload.shadowDouble === true;
    const chorusRole = typeof payload.chorusRole === "string" ? payload.chorusRole : undefined;
    const roleArtifactId =
      opcode === "BARGE_IN" && chorusRole ? input.roleArtifactIds?.[chorusRole] : undefined;

    return {
      version: "1.0",
      eventId: `${input.storyId}_natya_${beat}_${index}`,
      sceneId: input.storyId,
      beat,
      lane: laneByOpcode[opcode] ?? "narration",
      opcode,
      target: {
        artifactId: usesShadow
          ? (input.shadowArtifactId ?? input.resolvedArtifactId)
          : (roleArtifactId ?? input.resolvedArtifactId)
      },
      payload
    } as RuntimeStageCommand;
  });
};
