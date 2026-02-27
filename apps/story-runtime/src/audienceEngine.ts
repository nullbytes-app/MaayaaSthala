import type { MythicState } from "./mythicEngine";

type ChorusRole = "elder" | "trickster" | "witness" | "audience";
type AudienceIntent = "warn" | "tempt" | "support";

export type AudienceOutcome = {
  accepted: boolean;
  reason?: string;
  role?: ChorusRole;
  oathDelta?: number;
  desireDelta?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const toNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const toRole = (value: unknown): ChorusRole | undefined => {
  if (value === "elder" || value === "trickster" || value === "witness" || value === "audience") {
    return value;
  }
  return undefined;
};

const toIntent = (value: unknown): AudienceIntent | undefined => {
  if (value === "warn" || value === "tempt" || value === "support") {
    return value;
  }
  return undefined;
};

const influenceByIntent: Record<AudienceIntent, { oathDelta: number; desireDelta: number }> = {
  warn: { oathDelta: 10, desireDelta: -15 },
  tempt: { oathDelta: -10, desireDelta: 20 },
  support: { oathDelta: 8, desireDelta: -5 }
};

export const evaluateAudienceBargeIn = (
  beat: number,
  payload: unknown,
  _state: MythicState
): AudienceOutcome => {
  if (!isRecord(payload)) {
    return {
      accepted: false,
      reason: "invalid_payload"
    };
  }

  const role = toRole(payload.chorusRole);
  const intent = toIntent(payload.intent);
  const windowStart = toNumber(payload.windowStart);
  const windowEnd = toNumber(payload.windowEnd);

  if (!role || !intent || windowStart === undefined || windowEnd === undefined) {
    return {
      accepted: false,
      reason: "missing_required_fields"
    };
  }

  if (windowStart > windowEnd) {
    return {
      accepted: false,
      reason: "invalid_window"
    };
  }

  if (beat < windowStart || beat > windowEnd) {
    return {
      accepted: false,
      reason: "outside_interrupt_window",
      role
    };
  }

  const influence = influenceByIntent[intent];
  return {
    accepted: true,
    role,
    oathDelta: influence.oathDelta,
    desireDelta: influence.desireDelta
  };
};
