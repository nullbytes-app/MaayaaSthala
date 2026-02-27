import { describe, expect, it } from "vitest";

import { createTraceEvent, type TraceEvent } from "../src/telemetry/traceLogger";

describe("trace logger", () => {
  it("creates a trace event with request id, stage, payload, and timestamp", () => {
    const payload = {
      storyId: "story-1"
    };

    const event = createTraceEvent("req-1", "story.analyze.start", payload);

    const typedEvent: TraceEvent<typeof payload> = event;

    expect(typedEvent.requestId).toBe("req-1");
    expect(typedEvent.stage).toBe("story.analyze.start");
    expect(typedEvent.payload).toEqual(payload);
    expect(new Date(typedEvent.timestamp).toISOString()).toBe(typedEvent.timestamp);
  });
});
